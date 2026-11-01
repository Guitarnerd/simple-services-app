// Permission levels, lowest to highest. Safe to import from client components.
export const ROLES = ["MEMBER", "LEADER", "PLANNER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  MEMBER: "Member",
  LEADER: "Team leader",
  PLANNER: "Planner",
  ADMIN: "Admin",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  MEMBER: "Sees the directory and their own schedule.",
  LEADER: "Manages the people and positions on the teams they lead.",
  PLANNER: "Manages all people, teams, plans and songs.",
  ADMIN: "Everything, including logins and permission levels.",
};

export function hasRole(role: Role, minimum: Role) {
  return ROLES.indexOf(role) >= ROLES.indexOf(minimum);
}
