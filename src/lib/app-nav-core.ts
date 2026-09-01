export type NavigationItem = {
  label: string;
  href: string;
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
  align?: "end";
};

export function getActiveNavigationGroup(
  groups: NavigationGroup[],
  pathname: string,
  currentHref: string,
) {
  return groups.find(
    (group) =>
      group.items.some((item) =>
        isActivePath(pathname, item.href, currentHref),
      ) || isRelatedGroupPath(group, pathname),
  );
}

export function createCurrentHref(
  pathname: string,
  searchParams: { toString(): string },
) {
  const queryString = searchParams.toString();

  return queryString ? `${pathname}?${queryString}` : pathname;
}

export function isActivePath(
  pathname: string,
  href: string,
  currentHref: string,
) {
  const hrefPath = getHrefPath(href);
  const hrefQuery = href.split("?")[1];

  if (hrefQuery) {
    return (
      pathname === hrefPath && hasExpectedSearchParams(currentHref, hrefQuery)
    );
  }

  if (href === "/") {
    return pathname === "/";
  }

  if (href === "/drafts/new") {
    return pathname === "/drafts/new";
  }

  if (href === "/drafts") {
    return pathname === "/drafts" || /^\/drafts\/[^/]+\/edit$/.test(pathname);
  }

  if (href === "/youth") {
    return pathname === "/youth";
  }

  if (href === "/admin") {
    return pathname === "/admin";
  }

  if (href === "/work-schedule") {
    return pathname === "/work-schedule";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function isRelatedGroupPath(group: NavigationGroup, pathname: string) {
  const hrefPaths = group.items.map((item) => getHrefPath(item.href));

  if (
    hrefPaths.includes("/") &&
    /^\/(documents|attachments)(\/|$)/.test(pathname)
  ) {
    return true;
  }

  if (hrefPaths.includes("/resources") && pathname.startsWith("/resources")) {
    return true;
  }

  if (hrefPaths.includes("/youth") && pathname.startsWith("/youth/")) {
    return true;
  }

  if (hrefPaths.includes("/account") && pathname.startsWith("/account/")) {
    return true;
  }

  if (hrefPaths.includes("/admin") && pathname.startsWith("/admin/")) {
    return true;
  }

  return false;
}

function getHrefPath(href: string) {
  return href.split("?")[0] ?? href;
}

function hasExpectedSearchParams(currentHref: string, expectedQuery: string) {
  const currentQuery = currentHref.split("?")[1] ?? "";
  const currentParams = new URLSearchParams(currentQuery);
  const expectedParams = new URLSearchParams(expectedQuery);

  for (const [key, value] of expectedParams) {
    if (currentParams.get(key) !== value) {
      return false;
    }
  }

  return true;
}
