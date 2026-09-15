import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui';

export default function NotFoundPage() {
  return (
    <div className="page">
      <EmptyState
        icon="🧭"
        title="ไม่พบหน้าที่คุณต้องการ"
        description="ลิงก์อาจเปลี่ยนไปแล้ว หรือคุณไม่มีสิทธิ์เข้าถึงส่วนนี้"
        action={
          <Link to="/" className="btn btn--primary btn--sm">
            กลับหน้าแรก
          </Link>
        }
      />
    </div>
  );
}
