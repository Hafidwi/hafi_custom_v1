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
        // 2. LOGIKA BARU: Cek Penggunaan DP (Traceability)
        // Hanya jalan jika ini adalah Invoice DP (custom_dp dicentang) dan sudah disubmit
        if (frm.doc.custom_dp && frm.doc.docstatus === 1) {
            frm.trigger('check_dp_usage');
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
        frm.trigger('update_debit_to');
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
    },
    // Logic 3: Update Account Debit To (NEW)
    update_debit_to: function(frm) {
        if (!frm.doc.company) return;

        if (frm.doc.custom_dp) {
            // KASUS: DP Dicentang -> Ambil akun DP dari Company
            // GANTI 'custom_default_down_payment_account' DENGAN FIELDNAME ASLI DI COMPANY
            frappe.db.get_value('Company', frm.doc.company, 'custom_default_down_payment_account', (r) => {
                if (r && r.custom_default_down_payment_account) {
                    frm.set_value('debit_to', r.custom_default_down_payment_account);
                } else {
                    frappe.msgprint('Akun Default Down Payment belum diset di Company.');
                }
            });
        } else {
            // KASUS: DP Di-uncheck -> Kembalikan ke akun Piutang Standar
            // Mengambil 'default_receivable_account' dari Company
            frappe.db.get_value('Company', frm.doc.company, 'default_receivable_account', (r) => {
                if (r && r.default_receivable_account) {
                    frm.set_value('debit_to', r.default_receivable_account);
                }
            });
        }
    },
    custom_get_down_payment: function(frm) {
        // Validasi: Customer harus dipilih dulu
        if (!frm.doc.customer) {
            frappe.msgprint(__("Harap pilih Customer terlebih dahulu."));
            return;
        }

        // Panggil Server untuk cari Invoice DP
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Sales Invoice',
                filters: {
                    'customer': frm.doc.customer, // Filter customer yg sama
                    'custom_dp': 1,              // Hanya yang dicentang DP
                    'docstatus': 1,              // Hanya yang sudah Submitted/Posted
                    'status': ['!=', 'Cancelled'] // Jangan ambil yang Cancelled
                },
                // Ambil field yang dibutuhkan
                // net_total adalah jumlah sebelum pajak
                fields: ['name', 'posting_date', 'remarks', 'net_total'] 
            },
            callback: function(r) {
                if (r.message && r.message.length > 0) {
                    
                    // Opsional: Bersihkan tabel dulu agar tidak duplikat jika diklik 2x
                    frm.clear_table('custom_si_down_payment'); 

                    let total_dp = 0;

                    // Loop hasil dan masukkan ke Child Table
                    $.each(r.message, function(i, d) {
                        // 'si_down_payment' adalah nama field tabel di Sales Invoice
                        let row = frm.add_child('custom_si_down_payment'); 
                        
                        // Mapping Data
                        row.sales_invoice_dp = d.name;
                        row.dp_date = d.posting_date;
                        row.dp_remark = d.remarks;
                        row.amount = d.net_total; // Nilai sebelum PPN
                        total_dp += d.net_total;
                    });

                    // Refresh tabel agar data muncul di layar
                    frm.refresh_field('custom_si_down_payment');
                    
                    frappe.msgprint(__("{0} Invoice DP berhasil ditarik.", [r.message.length]));

                    // --- INSERT KE TABLE SALES TAXES AND CHARGES ---
                    if (total_dp > 0) {
                        // Ambil Akun DP dari Company
                        let dp_field_in_company = 'custom_default_down_payment_account';
                        
                        frappe.db.get_value('Company', frm.doc.company, dp_field_in_company, (r_comp) => {
                            if (r_comp && r_comp[dp_field_in_company]) {
                                let dp_account = r_comp[dp_field_in_company];

                                // Cek Table Taxes (Initialize jika kosong)
                                if (!frm.doc.taxes) frm.doc.taxes = [];
                                let taxes = frm.doc.taxes;
                                let dp_row = null;

                                // LOGIKA: Apakah baris pertama sudah Akun DP?
                                // Jika ya -> Update nilainya
                                // Jika tidak -> Insert baris baru di ATAS (Index 0)
                                if (taxes.length > 0 && taxes[0].account_head === dp_account) {
                                    dp_row = taxes[0];
                                } else {
                                    // Tambah row baru (masuk ke paling bawah)
                                    let new_row = frappe.model.add_child(frm.doc, "Sales Taxes and Charges", "taxes");
                                    // Pindahkan dari bawah ke atas (Index 0)
                                    taxes.pop(); 
                                    taxes.unshift(new_row); 
                                    dp_row = new_row;
                                }

                                // Set Nilai Row
                                dp_row.charge_type = 'Actual';
                                dp_row.account_head = dp_account;
                                dp_row.description = "Potongan Down Payment (DP)";
                                dp_row.tax_amount = -1 * total_dp; // PENTING: Negatif agar mengurangi

                                // TAMBAHAN: Masukkan Cost Center dari Header agar jurnal lengkap
                                // Cost Center wajib jika di setting akun mewajibkannya
                                dp_row.cost_center = frm.doc.cost_center || null;
                                
                                // Reset kolom lain agar bersih
                                dp_row.rate = 0; 

                                // Refresh Grid Pajak
                                frm.refresh_field('taxes');
                                
                                // Trigger Perhitungan Total Invoice agar Grand Total berubah
                                // Kita panggil trigger 'validate' atau manipulasi doc
                                if(frm.script_manager.has_handlers('validate', frm.doc.doctype)){
                                     frm.script_manager.trigger('validate');
                                }
                                
                            } else {
                                frappe.msgprint("Warning: Tidak bisa update Pajak. Akun Default DP belum diset di Company.");
                            }
                        });
                    }
                    // ----------------------------------------------
                } else {
                    frappe.msgprint(__("Tidak ditemukan Invoice DP untuk Customer ini."));
                }
            }
        });
    },
    // --- FUNGSI BARU: CEK PENGGUNAAN DP ---
    check_dp_usage: function(frm) {
        // GANTI 'Sales Invoice Down Payment' DENGAN NAMA DOCTYPE CHILD TABLE ANDA (Langkah 1)
        let child_doctype_name = 'Sales Invoice DP'; 

        // Panggil method Python yang baru kita buat
        // Path: nama_app.nama_module.nama_file.nama_fungsi
        frappe.call({
            method: 'hafi_custom_v1.api.get_final_invoices_using_dp',
            args: { 
                dp_name: frm.doc.name 
            },
            callback: function(r) {
                if (r.message && r.message.length > 0) {
                    // Jika ditemukan, buat link HTML
                    let links = r.message.map(d => {
                        return `<a href="/app/sales-invoice/${d.parent}" style="font-weight:bold; text-decoration:underline;">${d.parent}</a>`;
                    }).join(', ');

                    // Tampilkan Alert Biru di Header Form
                    frm.dashboard.set_headline_alert(
                        `<div class="row">
                            <div class="col-xs-12">
                                <span class="indicator whitespace-nowrap blue">
                                    <span>Info: DP ini telah digunakan pada Invoice Final: ${links}</span>
                                </span>
                            </div>
                        </div>`
                    );
                    
                    // Opsi Tambahan: Tambah Tombol "View Final Invoice" di menu atas
                    frm.add_custom_button(__('View Final Invoice'), function() {
                        // Buka invoice pertama yang ditemukan
                        frappe.set_route('Form', 'Sales Invoice', r.message[0].parent);
                    }, __("View"));
                }
            }
        });
    }
    
});