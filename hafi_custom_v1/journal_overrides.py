import frappe

def override_naming_series(doc, method):
    try:
        # Hanya jalankan jika tipe entry adalah Bank/Cash dan Bank Account terisi
        if doc.entry_type in ['Bank Entry', 'Cash Entry'] and doc.bank_account:
            
            # --- KONFIGURASI NAMA FIELD ---
            # Pastikan nama field ini BENAR-BENAR ADA di Customize Form
            field_type_transaksi = 'custom_type'
            field_incoming = 'custom_incoming_no'
            field_outgoing = 'custom_outgoing_no'
            # ------------------------------

            # Ambil data series dari Bank Account
            bank_details = frappe.db.get_value('Bank Account', doc.bank_account, [field_incoming, field_outgoing], as_dict=True)

            if bank_details:
                jenis_transaksi = doc.get(field_type_transaksi)
                series_baru = None

                # Logika penentuan series
                if jenis_transaksi == 'Pay':
                    series_baru = bank_details.get(field_outgoing)
                elif jenis_transaksi == 'Receive': 
                    series_baru = bank_details.get(field_incoming)

                # Jika series ditemukan, timpa naming_series default
                if series_baru:
                    doc.naming_series = series_baru
                    frappe.msgprint(f'Series berubah: {series_baru}', alert=True)

    except Exception as e:
        # Jika ada error, catat di Error Log ERPNext agar server tidak mati (502)
        frappe.log_error(f'Error di Custom Naming Series: {str(e)}', 'Custom Script Error')