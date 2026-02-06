import frappe

def validate(doc, method):
    """
    Fungsi ini akan dijalankan otomatis oleh Hooks saat tombol Save ditekan.
    Parameter 'doc' adalah dokumen Sales Invoice yang sedang diedit.
    """
    update_item_account_backend(doc)

    calculate_dp_deduction_backend(doc)

# --- FUNGSI BARU: UPDATE ITEM ACCOUNT ---
def update_item_account_backend(doc):
    # Hanya jalankan jika ini adalah Invoice DP
    if doc.custom_dp:
        # Ambil Akun Default DP dari Company
        dp_account = frappe.db.get_value("Company", doc.company, "custom_default_down_payment_account")
        
        if dp_account:
            # Loop semua item dan PAKSA ganti income_account
            for item in doc.items:
                if item.income_account != dp_account:
                    item.income_account = dp_account
                    # Opsional: Beri pesan di log/terminal untuk debugging
                    # frappe.msgprint(f"Mengubah akun item {item.item_code} menjadi {dp_account}")

def calculate_dp_deduction_backend(doc):
    # 1. Hitung Total DP dari Child Table
    total_dp = 0
    # Pastikan loop field yang benar
    for row in doc.get("custom_si_down_payment") or []:
        total_dp += row.amount
    
    # JIKA ADA DP
    if total_dp > 0:
        # A. RESET TABEL PAJAK (PENTING: Agar tidak bentrok dengan JS)
        doc.set("taxes", []) 
        
        # B. Ambil Akun Default dari Company
        # Kita ambil value dari Company settings
        dp_account = frappe.db.get_value("Company", doc.company, "custom_default_down_payment_account")
        
        if dp_account:
            # C. Masukkan Baris DP (Row 1)
            doc.append("taxes", {
                "charge_type": "Actual",
                "account_head": dp_account,
                "description": "Potongan Down Payment (DP) [Backend Verified]",
                "tax_amount": -1 * total_dp,
                "rate": 0,
                "cost_center": doc.cost_center
            })
            
            # D. Masukkan Baris PPN (Row 2) - Logic Auto Detect Template
            if doc.items:
                # Ambil template dari item pertama
                item_tax_template = doc.items[0].item_tax_template
                
                # Default values
                tax_rate = 12
                tax_account = "2140.001 - PPN Keluaran - EP" # Sebaiknya ambil dari settings/template juga
                
                # Jika pakai template, ambil detailnya dari database
                if item_tax_template:
                    template_doc = frappe.get_doc("Item Tax Template", item_tax_template)
                    if template_doc.taxes:
                        tax_rate = template_doc.taxes[0].tax_rate
                        tax_account = template_doc.taxes[0].tax_type

                doc.append("taxes", {
                    "charge_type": "On Previous Row Total",
                    "row_id": 1, # Merujuk ke Baris DP (index 1 di backend = row_id 1)
                    "account_head": tax_account,
                    "description": "PPN Keluaran (Selisih)",
                    "rate": tax_rate,
                    "cost_center": doc.cost_center
                })