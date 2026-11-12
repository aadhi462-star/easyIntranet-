// A community's settings moved into Manage as one page per section (v2 workstream G, G1):
// src/components/settings/. This file stays for the event and resource forms, which read the
// category lists from here, and for anything still rendering <Settings group={g} />.
import CommunitySettings from '../settings/CommunitySettings.jsx';

export { CATEGORY_LEN, CATEGORY_MAX, useCategoryLists } from '../settings/EventsResources.jsx';

export default function Settings({ group, section }) {
  return <CommunitySettings g={group} section={section} />;
}
