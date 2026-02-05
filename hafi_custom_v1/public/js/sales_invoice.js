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
            frm.trigger('update_item_account');
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
        frm.trigger('update_item_account');
    },
    // Trigger saat Item ditambahkan/diubah
    items_add: function(frm) {
        frm.trigger('update_item_account');
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
    //update_debit_to: function(frm) {
    //    if (!frm.doc.company) return;

    //    if (frm.doc.custom_dp) {
            // KASUS: DP Dicentang -> Ambil akun DP dari Company
            // GANTI 'custom_default_down_payment_account' DENGAN FIELDNAME ASLI DI COMPANY
    //       frappe.db.get_value('Company', frm.doc.company, 'custom_default_down_payment_account', (r) => {
    //            if (r && r.custom_default_down_payment_account) {
    //                frm.set_value('debit_to', r.custom_default_down_payment_account);
    //            } else {
    //                frappe.msgprint('Akun Default Down Payment belum diset di Company.');
    //            }
    //        });
    //    } else {
            // KASUS: DP Di-uncheck -> Kembalikan ke akun Piutang Standar
            // Mengambil 'default_receivable_account' dari Company
    //        frappe.db.get_value('Company', frm.doc.company, 'default_receivable_account', (r) => {
    //            if (r && r.default_receivable_account) {
    //                frm.set_value('debit_to', r.default_receivable_account);
    //            }
    //        });
    //    }
    //},

    // --- REVISI UTAMA: LOGIC AKUN DP ---
    // HAPUS function update_debit_to, GANTI dengan ini:
    update_item_account: function(frm) {
        if (!frm.doc.company) return;

        // Jika DP dicentang
        if (frm.doc.custom_dp) {
            let dp_field_in_company = 'custom_default_down_payment_account';
            
            frappe.db.get_value('Company', frm.doc.company, dp_field_in_company, (r) => {
                if (r && r[dp_field_in_company]) {
                    let dp_account = r[dp_field_in_company];

                    // Loop semua item, ganti Income Account menjadi Akun DP
                    $.each(frm.doc.items || [], function(i, d) {
                        if (d.income_account !== dp_account) {
                            frappe.model.set_value(d.doctype, d.name, 'income_account', dp_account);
                        }
                    });
                    
                    // (Opsional) Kembalikan Debit To ke Default jika sebelumnya salah
                    // Biarkan ERPNext menghandle Debit To (biasanya otomatis Piutang)
                } 
            });
        } 
        // Note: Jika di-uncheck, kita biarkan saja income account yang ada (atau user ganti manual), 
        // karena sulit menebak akun income default per item secara massal.
    },
    // 1. FUNGSI TOMBOL GET DOWN PAYMENT (VERSI BARU - PARTIAL)
    custom_get_down_payment: function(frm) {
        if (!frm.doc.customer) {
            frappe.msgprint("Pilih Customer dulu.");
            return;
        }

        // Panggil API Python untuk dapatkan SISA SALDO
        frappe.call({
            method: 'hafi_custom_v1.api.get_available_dp_invoices',
            args: {
                customer: frm.doc.customer
            },
            callback: function(r) {
                if (r.message && r.message.length > 0) {
                    // GANTI 'si_down_payment' DENGAN NAMA FIELD TABEL ANDA (misal: custom_si_down_payment)
                    let table_field = 'custom_si_down_payment'; 
                    
                    frm.clear_table(table_field); 
                    
                    $.each(r.message, function(i, d) {
                        let row = frm.add_child(table_field);
                        row.sales_invoice_dp = d.name;
                        row.dp_date = d.posting_date;
                        row.dp_remark = d.remarks;
                        
                        // PENTING: Ambil remaining_amount (Sisa), bukan net_total
                        row.amount = d.remaining_amount; 
                    });

                    frm.refresh_field(table_field);
                    frappe.msgprint(r.message.length + " Invoice DP dengan sisa saldo ditemukan.");

                    // Panggil fungsi hitung pajak
                    frm.trigger('calculate_dp_deduction');

                } else {
                    frappe.msgprint("Tidak ada Invoice DP dengan sisa saldo untuk customer ini.");
                }
            }
        });
    },

    // 2. FUNGSI HITUNG PAJAK (VERSION: AUTO-DETECT ITEM TAX TEMPLATE)
    calculate_dp_deduction: function(frm) {
        let total_dp = 0;
        let table_field = 'custom_si_down_payment'; 

        // 1. Hitung Total DP
        $.each(frm.doc[table_field] || [], function(i, d) {
            total_dp += d.amount;
        });

        // Helper: Fungsi untuk membangun tabel pajak
        let build_tax_table = function(ppn_account, ppn_rate) {
             let dp_field_in_company = 'custom_default_down_payment_account';
             
             frappe.db.get_value('Company', frm.doc.company, dp_field_in_company, (r_comp) => {
                if (r_comp && r_comp[dp_field_in_company]) {
                    let dp_account = r_comp[dp_field_in_company];

                    // RESET TOTAL TABEL PAJAK
                    frm.clear_table('taxes');

                    // BARIS 1: DOWN PAYMENT (Index 0)
                    let row_dp = frm.add_child('taxes');
                    row_dp.charge_type = 'Actual';
                    row_dp.account_head = dp_account;
                    row_dp.description = "Potongan Down Payment (DP)";
                    row_dp.tax_amount = -1 * total_dp; // Negatif
                    row_dp.rate = 0;
                    
                    // BARIS 2: PPN (Index 1) - Jika Akun PPN ditemukan
                    if (ppn_account) {
                        let row_ppn = frm.add_child('taxes');
                        // Set ke 'On Previous Row Total' agar menghitung dari (Item - DP)
                        row_ppn.charge_type = 'On Previous Row Total';
                        row_ppn.row_id = 1; // Merujuk ke Baris 1 (DP)
                        row_ppn.account_head = ppn_account;
                        row_ppn.description = "PPN Keluaran (Selisih)";
                        row_ppn.rate = ppn_rate; 
                    }

                    frm.refresh_field('taxes');
                    
                    // Trigger Save/Validate agar angka terhitung
                    if(frm.script_manager.has_handlers('validate', frm.doc.doctype)){
                         frm.script_manager.trigger('validate');
                    }
                }
             });
        };

        // --- LOGIKA UTAMA ---
        if (total_dp > 0) {
            // Cek 1: Apakah sudah ada PPN di tabel header? (Manual select)
            let existing_ppn_account = null;
            let existing_ppn_rate = 0;
            
            if (frm.doc.taxes && frm.doc.taxes.length > 0) {
                 $.each(frm.doc.taxes, function(i, row){
                     if (!row.account_head.includes('2121.001')) { // Bukan akun DP
                         existing_ppn_account = row.account_head;
                         existing_ppn_rate = row.rate;
                         return false; 
                     }
                 });
            }

            if (existing_ppn_account) {
                // Jika user manual pilih template, pakai itu
                build_tax_table(existing_ppn_account, existing_ppn_rate || 12);
            } else {
                // Cek 2: Jika kosong, AMBIL DARI ITEM TAX TEMPLATE
                if (frm.doc.items && frm.doc.items.length > 0 && frm.doc.items[0].item_tax_template) {
                    let template_name = frm.doc.items[0].item_tax_template;
                    
                    // Panggil Server untuk baca detail Template
                    frappe.call({
                        method: 'frappe.client.get',
                        args: { doctype: 'Item Tax Template', name: template_name },
                        callback: function(r) {
                            if (r.message && r.message.taxes && r.message.taxes.length > 0) {
                                // Ambil Akun dan Rate dari dalam Template
                                let tax_detail = r.message.taxes[0];
                                build_tax_table(tax_detail.tax_type, tax_detail.tax_rate);
                            } else {
                                frappe.msgprint("Item Tax Template kosong atau tidak valid.");
                            }
                        }
                    });
                } else {
                    // Fallback: Jika tidak ada template sama sekali, hanya pasang DP
                    build_tax_table(null, 0);
                    frappe.msgprint("Warning: Tidak ditemukan setting PPN (Header maupun Item). PPN tidak akan dihitung.");
                }
            }
        } else {
            // Jika DP dihapus (Nol), reset tabel (Opsional)
             frm.clear_table('taxes');
             frm.refresh_field('taxes');
        }
    },
    // --- FUNGSI BARU: CEK PENGGUNAAN DP ---
    check_dp_usage: function(frm) {
        frappe.call({
            method: 'hafi_custom_v1.api.get_final_invoices_using_dp',
            args: { dp_name: frm.doc.name },
            callback: function(r) {
                if (r.message && r.message.length > 0) {
                    
                    // 1. Buat Link HTML untuk Alert (Traceability visual)
                    let links = r.message.map(d => {
                        return `<a href="/app/sales-invoice/${d.parent}" style="font-weight:bold; text-decoration:underline;">${d.parent}</a>`;
                    }).join(', ');

                    // Tampilkan Alert
                    frm.dashboard.set_headline_alert(
                        `<div class="row">
                            <div class="col-xs-12">
                                <span class="indicator whitespace-nowrap blue">
                                    <span>Info: DP ini telah digunakan pada Invoice Final: ${links}</span>
                                </span>
                            </div>
                        </div>`
                    );
                    
                    // 2. Logic Tombol "View Final Invoice" (SMART VIEW)
                    frm.add_custom_button(__('View Final Invoice'), function() {
                        // Kumpulkan semua nomor invoice ke dalam Array
                        let invoice_names = r.message.map(d => d.parent);

                        if (invoice_names.length === 1) {
                            // KASUS A: Cuma 1 Invoice -> Buka Form langsung
                            frappe.set_route('Form', 'Sales Invoice', invoice_names[0]);
                        } else {
                            // KASUS B: Lebih dari 1 Invoice -> Buka List View difilter
                            frappe.route_options = {
                                'name': ['in', invoice_names] // Filter: Name IN [List Invoice]
                            };
                            frappe.set_route('List', 'Sales Invoice');
                        }
                    }, __("View"));
                }
            }
        });
    }
});

// 3. TRIGGER UPDATE REALTIME
// Tambahkan ini di LUAR blok frappe.ui.form.on('Sales Invoice', {...})
// Ganti 'Sales Invoice DP' dengan nama DocType Child Table Anda
frappe.ui.form.on('Sales Invoice DP', {
    // Saat user merubah nilai amount manual
    amount: function(frm, cdt, cdn) {
        frm.trigger('calculate_dp_deduction');
    },
    // Saat user menghapus baris DP
    si_down_payment_remove: function(frm) {
        frm.trigger('calculate_dp_deduction');
    },

    
});