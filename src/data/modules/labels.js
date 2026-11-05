// User labels (CommunitySpaces "profile labels"): admin-defined tags shown next to a member's
// name. Each label keeps its own member list so user records stay untouched.
export const seed = {
  userLabels: [
    { id: 'lb0', name: 'Community Host', tone: 'saffron', icon: 'shield', description: 'Runs the community: approvals, moderation and events.', members: ['u21', 'u22'], showOnPosts: true },
    { id: 'lb1', name: 'Mentor', tone: 'leaf', icon: 'sprout', description: 'Volunteers time to guide students and recent grads.', members: ['u3', 'u8', 'u1', 'u32', 'u28'], showOnPosts: true },
    { id: 'lb2', name: 'Chapter Lead', tone: 'saffron', icon: 'pinned', description: 'Runs a city chapter and its meet-ups.', members: ['u5', 'u8'], showOnPosts: true },
    { id: 'lb3', name: 'Verified Alumni', tone: 'gold', icon: 'shield', description: 'Graduation details confirmed by the alumni office.', members: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'], showOnPosts: false },
    { id: 'lb4', name: 'Founder', tone: 'saffron', icon: 'sparkle', description: 'Started a company. Happy to talk startups.', members: ['u2'], showOnPosts: true },
    { id: 'lb5', name: 'Alumni Office', tone: 'gold', icon: 'cap', description: 'Official alumni relations team.', members: ['u7'], showOnPosts: true },
    { id: 'lb6', name: 'Volunteer', tone: 'leaf', icon: 'groups', description: 'Helps run events and the Homecoming committee.', members: ['u4', 'u6', 'u33', 'u26'], showOnPosts: false },
  ],
};
