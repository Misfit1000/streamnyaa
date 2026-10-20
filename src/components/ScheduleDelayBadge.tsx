import '../styles/calendar-badge.css';

/** Real typography, shared by the web poster grid and native Calendar cards. */
export default function ScheduleDelayBadge({ label }: { label?: string }) {
  if (!label) return null;
  return <span className="sn-schedule-artwork-delay" aria-label={label}><span>{label}</span></span>;
}
