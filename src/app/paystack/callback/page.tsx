import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import { verifyPaystackTransaction } from '../../../lib/paystack';

export const dynamic = 'force-dynamic';

interface PaystackCallbackPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default async function PaystackCallbackPage({ searchParams }: PaystackCallbackPageProps) {
  const params = await searchParams;
  const reference = getParam(params, 'reference') || getParam(params, 'trxref');

  let ok = false;
  let message = 'Paystack reference is missing.';

  if (reference) {
    const result = await verifyPaystackTransaction(reference);
    ok = result.ok;
    message = result.ok
      ? 'Paystack confirmed this payment. The hotel ledger updates from the signed Paystack webhook.'
      : result.message;
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        {ok ? <CheckCircle2 size={32} color="#12613a" /> : <XCircle size={32} color="#8a2d2d" />}
        <h1>{ok ? 'Payment verified' : 'Payment not verified'}</h1>
        <p>{message}</p>
        {reference ? <p className="form-message">Reference: {reference}</p> : null}
        <Link className="primary-action" href="/dashboard/reservations">Back to reservations</Link>
      </section>
    </main>
  );
}
