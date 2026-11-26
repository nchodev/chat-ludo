/** WhatsApp-style delivery state: a clock while sending, one tick when stored, two blue ticks once read. */
export function Ticks({ state }: { state: 'pending' | 'sent' | 'read' | 'failed' }) {
  if (state === 'failed') {
    return (
      <svg viewBox="0 0 16 16" className="size-3.5 text-[#f15c6d]" aria-label="Non envoyé">
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path d="M8 4.5v4.2M8 11.2v.3" stroke="#0b141a" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (state === 'pending') {
    return (
      <svg viewBox="0 0 16 16" className="size-3.5 text-[#ffffff99]" aria-label="Envoi…">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 4.8V8l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  const read = state === 'read';
  return (
    <svg viewBox="0 0 18 12" className={`h-3 w-[18px] ${read ? 'text-[#53bdeb]' : 'text-[#ffffff99]'}`} aria-label={read ? 'Lu' : 'Envoyé'}>
      <path d="m1 6.5 3.2 3.2L11 2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {read && <path d="m7.4 9.7.3.3L15.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
