frappe.ui.form.on('Sales Invoice', {
    refresh: function(frm) {
        if (frm.doc.docstatus === 1 && frm.doc.outstanding_amount > 0) {
            frm.add_custom_button(__('Journal Entry'), function() {
                
                // Menyusun data baris untuk tabel accounts di Journal Entry
                let accounts = [
                    {
                        "account": frm.doc.debit_to,
                        "party_type": "Customer",
                        "party": frm.doc.customer,
                        "credit_in_account_currency": frm.doc.outstanding_amount,
                        "reference_type": "Sales Invoice",
                        "reference_name": frm.doc.name
                    },
                    {
                        "account": "" // Baris kosong untuk diisi Kas/Bank oleh user
                    }
                ];

                // Menggunakan route_options agar data otomatis terisi saat form terbuka
                frappe.route_options = {
                    "voucher_type": "Bank Entry",
                    "company": frm.doc.company,
                    "custom_type": "Receive",
                    "accounts": accounts
                };

                // Pindah ke form Journal Entry baru
                frappe.set_route("Form", "Journal Entry", "new-journal-entry-1");

            }, __("Create"));
        }
    }
});