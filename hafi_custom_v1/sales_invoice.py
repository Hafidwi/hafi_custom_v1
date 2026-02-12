import frappe
from frappe import _

def validate(doc, method):
    # Hitung total DP
    total_dp_deduction = 0
    for row in doc.get("custom_si_down_payment") or []:
        total_dp_deduction += row.amount

    # SKENARIO 1: INVOICE DP
    if doc.custom_dp and total_dp_deduction == 0:
        update_item_to_liability(doc)

    # SKENARIO 2: INVOICE FINAL
    elif total_dp_deduction > 0:
        restore_item_to_revenue(doc)
        calculate_dp_deduction_backend(doc, total_dp_deduction)

def update_item_to_liability(doc):
    dp_account = frappe.db.get_value("Company", doc.company, "custom_default_down_payment_account")
    if dp_account:
        for item in doc.items:
            if item.income_account != dp_account:
                item.income_account = dp_account

def restore_item_to_revenue(doc):
    for item in doc.items:
        original_account = None
        # V15 Compatible Search
        item_default = frappe.db.get_value("Item Default", 
            {"parent": item.item_code, "company": doc.company}, "income_account")
        if item_default: original_account = item_default
        
        if not original_account:
            item_group = frappe.db.get_value("Item", item.item_code, "item_group")
            if item_group: original_account = frappe.db.get_value("Item Group", item_group, "income_account")
            
        if original_account and item.income_account != original_account:
            item.income_account = original_account

def calculate_dp_deduction_backend(doc, total_dp):
    # 1. PERSIAPAN DATA
    doc.set("taxes", []) 
    dp_account = frappe.db.get_value("Company", doc.company, "custom_default_down_payment_account")
    
    # Ambil Cost Center (Wajib)
    cost_center = doc.cost_center or (doc.items[0].cost_center if doc.items else None)
    
    # Hitung Net Total Item (Untuk pegangan kita menghitung manual)
    net_total_items = sum(item.net_amount for item in doc.items)

    if dp_account:
        # Tentukan Rate & Akun PPN
        tax_rate = 12.0
        tax_account = "2140.001 - PPN Keluaran - EP"
        
        if doc.items and doc.items[0].item_tax_template:
            template_doc = frappe.get_doc("Item Tax Template", doc.items[0].item_tax_template)
            if template_doc.taxes:
                tax_rate = template_doc.taxes[0].tax_rate
                tax_account = template_doc.taxes[0].tax_type

        # ---------------------------------------------------------
        # HITUNG MATEMATIKA DI PYTHON (Bukan di ERPNext)
        # ---------------------------------------------------------
        
        # 1. Hitung Angka DP
        val_dp = -1 * total_dp
        
        # 2. Hitung Angka PPN (Dari Sisa)
        # Rumus: (Total Barang - DP) * 12%
        taxable_amount = net_total_items + val_dp
        val_ppn = taxable_amount * (tax_rate / 100.0)
        
        # ---------------------------------------------------------
        # MASUKKAN KE TABEL SEBAGAI 'ACTUAL' (ANGKA MATI)
        # ---------------------------------------------------------

        # BARIS 1: DP (Actual)
        # Kita isi 'total' agar kolom kanan tidak Rp 0
        running_total = net_total_items + val_dp 
        
        doc.append("taxes", {
            "charge_type": "Actual", # PENTING: Jangan pakai Actual di JS, tapi Actual di Python aman
            "account_head": dp_account,
            "description": "Potongan DP (Pengurang DPP)",
            "rate": 0,
            "cost_center": cost_center,
            "category": "Total",
            "add_deduct_tax": "Add",
            "included_in_print_rate": 0,
            # ISI SEMUA FIELD AMOUNT MANUAL:
            "tax_amount": val_dp,
            "base_tax_amount": val_dp,
            "tax_amount_after_discount_amount": val_dp,
            "base_tax_amount_after_discount_amount": val_dp,
            "total": running_total,      # Agar tampilan UI benar
            "base_total": running_total  # Agar tampilan UI benar
        })

        # BARIS 2: PPN (Actual - Hasil hitungan Python)
        # Kita tidak pakai 'On Previous Row' lagi, kita tembak langsung angkanya
        running_total += val_ppn
        
        if tax_account:
            doc.append("taxes", {
                "charge_type": "Actual", # KITAU UBAH JADI ACTUAL
                "account_head": tax_account,
                "description": f"PPN Keluaran {tax_rate}% (Atas Sisa {taxable_amount:,.0f})",
                "rate": 0, # Rate 0 karena kita isi amount langsung
                "cost_center": cost_center,
                "category": "Total",
                "add_deduct_tax": "Add",
                "included_in_print_rate": 0,
                # ISI SEMUA FIELD AMOUNT MANUAL:
                "tax_amount": val_ppn,
                "base_tax_amount": val_ppn,
                "tax_amount_after_discount_amount": val_ppn,
                "base_tax_amount_after_discount_amount": val_ppn,
                "total": running_total,
                "base_total": running_total
            })