import Link from "next/link";
import { Policy } from "@/components/shared";
export default function Page() {
  return (
    <main className="page narrow">
      <span className="eyebrow">A FAIRER WAY TO WAIT</span>
      <h1>A little clarity goes a long way.</h1>
      <div className="panel prose">
        <h2>1. Choose your service</h2>
        <p>
          Check its location, hours, required documents, and queue. Estimates
          are explained ranges and may change.
        </p>
        <h2>2. Save your place</h2>
        <p>
          Choose a visit reason. No name, student ID, CNIC, email, or phone is
          needed. You can hold one active place per service per day in this
          browser.
        </p>
        <h2>3. Keep your ticket open</h2>
        <p>
          Your private ticket updates about every three seconds while visible.
          When called, go to your assigned counter. Sound is optional and
          requires your permission through the Enable sound button.
        </p>
        <h2>Your browser is your ticket holder</h2>
        <p>
          Ownership lives in a private cookie. A ticket link alone cannot
          retrieve your private details. Clearing browser storage or moving
          devices can lose self-service access. This prototype cannot enforce
          real-world identity; clearing cookies can bypass per-browser limits.
        </p>
        <Policy />
        <h2>Pauses preserve your place</h2>
        <p>
          A pause stops new joins and calls. Existing visits can finish. You’ll
          see the reason, and estimates become unavailable. Old waiting and
          missed tickets expire through rollover; they never join tomorrow’s
          line automatically.
        </p>
        <h2>Connection trouble?</h2>
        <p>
          Last fetched information stays visible and is labeled stale while
          retries continue. Ticket issuance requires a live server connection;
          this is not an offline ticketing system.
        </p>
        <Link className="button" href="/">
          Find a service
        </Link>
      </div>
    </main>
  );
}
