import frappe

@frappe.whitelist()
def get_final_invoices_using_dp(dp_name):
    """
    Mencari Sales Invoice (Final) yang menggunakan Sales Invoice DP tertentu.
    Menggunakan JOIN agar validasi status submit (docstatus=1) lebih akurat
    mengambil dari Parent (Invoice Final), bukan dari Child.
    """
    sql = """
        SELECT t1.parent 
        FROM `tabSales Invoice DP` t1
        INNER JOIN `tabSales Invoice` t2 ON t1.parent = t2.name
        WHERE t1.sales_invoice_dp = %s AND t2.docstatus = 1
    """
    
    data = frappe.db.sql(sql, (dp_name,), as_dict=True)
    return data
@frappe.whitelist()
def get_available_dp_invoices(customer):
    """
    Mengambil daftar Invoice DP yang masih memiliki sisa saldo.
    Rumus: Net Total DP - Total Amount yang sudah dipakai di Invoice Final (Submitted)
    """
    sql = """
        SELECT 
            dp.name, 
            dp.posting_date, 
            dp.remarks, 
            dp.net_total as original_amount,
            
            -- Subquery untuk menghitung total yang sudah terpakai
            (dp.net_total - IFNULL(
                (SELECT SUM(child.amount) 
                 FROM `tabSales Invoice DP` child
                 INNER JOIN `tabSales Invoice` parent ON child.parent = parent.name
                 WHERE child.sales_invoice_dp = dp.name 
                 AND parent.docstatus = 1
                ), 0)
            ) as remaining_amount
            
        FROM 
            `tabSales Invoice` dp
        WHERE 
            dp.customer = %s 
            AND dp.custom_dp = 1 
            AND dp.docstatus = 1 
            AND dp.status != 'Cancelled'
        
        -- Hanya tampilkan yang sisanya masih positif
        HAVING remaining_amount > 0
    """
    
    data = frappe.db.sql(sql, (customer,), as_dict=True)
    return data