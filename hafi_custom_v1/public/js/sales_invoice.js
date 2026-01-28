frappe.ui.form.on('Sales Invoice', {
    refresh: function(frm) {
        if (frm.doc.docstatus === 1 && frm.doc.outstanding_amount > 0) {
            frm.add_custom_button(__('Journal Entry'), function() {
                
                // Pastikan struktur Journal Entry terload
                frappe.model.with_doctype('Journal Entry', function() {
                    let je = frappe.model.get_new_doc('Journal Entry');
                    
                    // Set Header
                    je.voucher_type = 'Bank Entry';
                    je.company = frm.doc.company;
                    je.custom_type = 'Receive'; // Gunakan payment_type, bukan custom_type

                    // Baris 1: Piutang (Credit)
                    let row1 = frappe.model.add_child(je, 'accounts');
                    row1.account = frm.doc.debit_to;
                    row1.party_type = 'Customer';
                    row1.party = frm.doc.customer;
                    row1.credit_in_account_currency = frm.doc.outstanding_amount;
                    row1.reference_type = 'Sales Invoice';
                    row1.reference_name = frm.doc.name;

                    // Baris 2: Baris Kosong untuk Bank nantinya
                    frappe.model.add_child(je, 'accounts');

                    // Pindah ke form dengan dokumen yang sudah disiapkan
                    frappe.set_route('Form', 'Journal Entry', je.name);
                });

            }, __("Create"));
        }
    }
});