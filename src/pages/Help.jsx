// Help and Support: how the parts that exist today work. Kept accurate to the current product.
import { Link } from 'react-router-dom';
import { PublicPage, Section } from '../components/public/PublicChrome.jsx';

const a = 'font-semibold text-brand-300 underline-offset-4 hover:underline';

export default function Help() {
  return (
    <PublicPage title="Help and Support" lede="How to get started, and answers to common questions.">
      <Section title="Creating an account">
        <p><Link className={a} to="/signup">Create an account</Link> with your name, email and a password. We send a confirmation email; open the link in it to finish. Confirmation links last 24 hours and work once. If yours expired, try signing in: you’ll be offered a new link.</p>
        <p>Some CommunityOne sites also ask an administrator to approve new accounts, or accept only certain email domains. If so, the sign-up page tells you.</p>
      </Section>
      <Section title="Signing in and passwords">
        <p>Sign in with your email and password. After several wrong attempts, sign-in pauses for a few minutes to protect your account.</p>
        <p>Forgot your password? Use “Forgot your password?” on the <Link className={a} to="/login">sign-in page</Link>. The reset link works once and expires after an hour. Resetting your password signs you out on every device.</p>
      </Section>
      <Section title="Joining communities">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li><b className="text-white">Public:</b> join instantly from the community’s card.</li>
          <li><b className="text-white">Private:</b> request to join; a community admin approves or declines. You can withdraw a request while it’s pending.</li>
          <li><b className="text-white">Closed:</b> invitation only. Closed communities don’t appear in search or listings.</li>
        </ul>
        <p>You can leave a community at any time from its page.</p>
      </Section>
      <Section title="Events and RSVPs">
        <p>Members can RSVP Going, Maybe or Not going. Some events have a capacity or an RSVP deadline; when an event is full or RSVPs have closed, the page says so. “Not going” is always allowed, so you can free your place.</p>
        <p>If an event you said Going or Maybe to is cancelled, or its time or place changes, we email you.</p>
      </Section>
      <Section title="Your privacy">
        <p>You choose who sees your contact details (everyone, only your connections, or nobody) and whether you appear in the member directory. Blocking someone hides you from each other. See the <Link className={a} to="/privacy">Privacy Policy</Link> for what is stored.</p>
      </Section>
      <Section title="Getting help with a community">
        <p>Each community is run by its owner and admins; you’ll find them on the community’s Members page. For anything about your account itself, see <Link className={a} to="/contact">Contact</Link>.</p>
      </Section>
    </PublicPage>
  );
}
