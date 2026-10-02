export type MeetingItem = { title: string; content: string };
export function readMeetingItems(values: Record<string, string>): MeetingItem[] {
  const titles = (values.agenda ?? "").replace(/\r\n?/g, "\n").split("\n").map(s => s.trim()).filter(Boolean).map(s => s.replace(/^\d+\s*[.)]\s*/, ""));
  const discussions: MeetingItem[] = [];
  let item: MeetingItem | null = null;
  for (const line of (values.discussion ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const heading = line.trim().match(/^안건\s*\d+\s*[.)]\s*(.*)$/);
    if (heading) { if (item) discussions.push(item); item = { title: heading[1], content: "" }; }
    else if (item) item.content += line + "\n";
  }
  if (item) discussions.push(item);
  for (const d of discussions) d.content = d.content.trim().replace(/^논의\s*내용\n?/, "").trim();
  if (titles.length) return titles.map((title, i) => ({ title, content: discussions[i]?.content ?? (i === 0 && !discussions.length ? values.discussion ?? "" : "") }));
  return discussions.length ? discussions : [{ title: "", content: "" }];
}
export function writeMeetingItems(items: MeetingItem[]) {
  return { agenda: items.map((item, i) => (i + 1) + ". " + item.title.trim()).join("\n"), discussion: items.map((item, i) => ["안건 " + (i + 1) + ". " + item.title.trim(), "논의 내용", item.content.trim()].join("\n")).join("\n\n") };
}
