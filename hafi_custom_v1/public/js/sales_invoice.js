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
    // 2. Cek Naming Series saat load (hanya jika masih Draft)
        if (frm.doc.docstatus === 0) {
            frm.trigger('update_naming_series');
        }
    },

    // Trigger saat checkbox 'Is Return' berubah
    is_return: function(frm) {
        frm.trigger('update_naming_series');
    },

    // Trigger saat checkbox 'DP' berubah
    // PENTING: Ganti 'custom_dp' dengan nama field asli jika berbeda (misal: 'dp')
    custom_dp: function(frm) { 
        frm.trigger('update_naming_series');
        frm.trigger('toggle_dp_section');
    },

    // Fungsi Utama Logika Series
    update_naming_series: function(frm) {
        // Prioritas 1: Jika ini Return, maka jadi Credit Note (CN)
        if (frm.doc.is_return) {
            frm.set_value('naming_series', '.custom_abbr.-CN-.MM.YY');
        
        // Prioritas 2: Jika bukan Return TAPI checkbox DP dicentang
        } else if (frm.doc.custom_dp) {
            frm.set_value('naming_series', '.custom_abbr.-DP-.MM.YY');
            
        // Prioritas 3: Jika bukan keduanya, kembali ke Invoice normal (INV)
        } else {
            frm.set_value('naming_series', '.custom_abbr.-INV-.MM.YY');
        }
    },
    toggle_dp_section: function(frm) {
        // GANTI 'sec_down_payment' DENGAN FIELDNAME SECTION BREAK ANDA
        let section_fieldname = 'custom_down_payment'; 

        if (frm.doc.custom_dp) {
            // Jika DP dicentang, HIDE section (false)
            frm.toggle_display(section_fieldname, false);
        } else {
            // Jika DP tidak dicentang, SHOW section (true)
            frm.toggle_display(section_fieldname, true);
        }
    }
});