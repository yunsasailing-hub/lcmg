import * as XLSX from 'xlsx';
import type { InventoryRequestWithItems } from '@/hooks/useInventoryRequests';

export function exportRequestsToXlsx(requests: InventoryRequestWithItems[]) {
  const rows: any[] = [];
  for (const r of requests) {
    for (const it of r.items) {
      rows.push({
        Date: r.request_date,
        Branch: r.branch_name ?? '',
        Department: r.department,
        'Item code': it.item_code ?? '',
        'Item name': it.item_name,
        Unit: it.unit ?? '',
        'Actual stock': it.actual_stock ?? '',
        'Requested qty': it.requested_qty ?? '',
        'Approved qty': it.approved_qty ?? '',
        Note: it.note ?? '',
        'Staff name': r.staff_name ?? '',
        'Owner status': r.status,
      });
    }
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Confirmed requests');
  const ts = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `inventory_confirmed_${ts}.xlsx`);
}