import frappe

@frappe.whitelist()
def get_final_invoices_using_dp(dp_name):
    """
    Mencari Sales Invoice (Final) yang menggunakan Sales Invoice DP tertentu.
    Hanya mencari di invoice yang sudah disubmit (docstatus=1).
    """
    # GANTI 'Sales Invoice Down Payment' SESUAI NAMA DOCTYPE CHILD TABLE ANDA
    # Tips: Cek di MariaDB/Table jika ragu, biasanya tab + Nama Doctype (spasi ganti jadi _)
    # Contoh: tabSales Invoice Down Payment
    
    data = frappe.db.sql("""
        SELECT parent 
        FROM `tabSales Invoice DP` 
        WHERE sales_invoice_dp = %s AND docstatus = 1
    """, (dp_name,), as_dict=True)
    
    return data