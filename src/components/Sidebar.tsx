import Link from "next/link";
import SignOutLink from "@/components/SignOutLink";

// Feste Seitennavigation laut design-spec.md (mobil: Bottom-Navigation).
// Aufgaben (kundenübergreifende Sicht) folgt; bis dahin führt der Punkt auf Start.

const NAV = [
  { href: "/", label: "Meine Kunden", match: "/" },
  { href: "/portfolio", label: "Portfolio", match: "/portfolio" },
  { href: "/", label: "Aufgaben", match: "/aufgaben" },
  { href: "/skills", label: "Skills", match: "/skills" },
  { href: "/verwaltung", label: "Verwaltung", match: "/verwaltung" },
];

export default function Sidebar({
  active,
  newCount = 0,
  userName = "Albert Ortig",
  userRole = "Account Lead",
}: {
  active: string;
  newCount?: number;
  userName?: string;
  userRole?: string;
}) {
  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <aside className="sticky bottom-0 z-40 flex flex-row items-center gap-2 border-t border-gray-150 bg-paper px-4 py-2.5 max-md:fixed max-md:w-full md:top-0 md:h-screen md:flex-col md:items-stretch md:gap-8 md:border-r md:border-t-0 md:px-5 md:py-7">
      <div className="text-[1.15rem] font-semibold tracking-tight max-md:hidden">
        Netural <span className="font-light text-gray-500">Marktradar</span>
      </div>
      <nav className="flex w-full flex-row justify-around gap-0.5 md:flex-col md:justify-start">
        {NAV.map((item) => {
          const isActive = item.match === active;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-el px-3 py-2 text-[0.8rem] md:w-full md:text-[0.95rem] ${
                isActive
                  ? "bg-ink font-medium text-paper"
                  : "font-normal text-gray-700 hover:bg-gray-75"
              }`}
            >
              {item.label}
              {item.label === "Meine Kunden" && newCount > 0 && (
                <span className="ml-auto rounded-full bg-accent px-2 py-px text-xs font-medium text-ink">
                  {newCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto max-md:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-ink text-[0.85rem] font-medium text-paper">
            {initials}
          </div>
          <div>
            <div className="text-[0.85rem] font-normal text-gray-900">{userName}</div>
            <div className="text-[0.72rem] text-gray-500">{userRole}</div>
          </div>
        </div>
        <SignOutLink />
      </div>
    </aside>
  );
}
