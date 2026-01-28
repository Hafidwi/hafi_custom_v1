frappe.ui.form.on('Journal Entry', {
    refresh: function(frm) {
        console.log("Script Hafi Custom Loaded");
    },
    custom_bank_account: function(frm) {
        if (frm.doc.custom_bank_account) {
            frappe.call({
                method: "frappe.client.get_value",
                args: {
                    doctype: "Bank Account",
                    filters: { name: frm.doc.custom_bank_account },
                    fieldname: "account"
                },
                callback: function(r) {
                    if (r.message && r.message.account) {
                        const target_acc = r.message.account;

                        // Cari baris yang benar-benar kosong atau sudah berisi akun bank tersebut
                        let row = frm.doc.accounts.find(d => !d.account) || 
                                  frm.doc.accounts.find(d => d.account === target_acc);

                        if (!row) {
                            row = frm.add_child("accounts");
                        }

                        row.account = target_acc;

                        // Hitung Balance dari baris LAIN
                        let total = 0;
                        if (frm.doc.accounts && frm.doc.accounts.length) {
                            frm.doc.accounts.forEach(d => {
                                if (d.account && d.account !== target_acc) {
                                    // Ambil nilai yang ada (debit atau credit)
                                    total += (d.debit_in_account_currency || d.credit_in_account_currency || 0);
                                }
                            });
                        }

                        // Set nominal pada baris bank
                        if (frm.doc.custom_type === "Receive") {
                            row.debit_in_account_currency = total;
                            row.credit_in_account_currency = 0;
                        } else {
                            row.credit_in_account_currency = total;
                            row.debit_in_account_currency = 0;
                        }

                        frm.refresh_field("accounts");
                    }
                }
            });
        }
    }
});