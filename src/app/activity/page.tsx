import { getWorld, getActivity } from "@/lib/db/queries";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  blocked: "destructive",
  quarantined: "destructive",
  error: "destructive",
  rejected: "destructive",
  skipped: "outline",
};

export default function ActivityPage() {
  const world = getWorld();
  if (!world) {
    return <p className="text-sm text-muted-foreground">Seed a world to see activity.</p>;
  }
  const rows = getActivity(world.id, 100);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-lg font-semibold">Activity</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet — run a heartbeat.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Tick</TableHead>
              <TableHead className="w-24">Actor</TableHead>
              <TableHead className="w-36">Action</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead>Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{row.tick}</TableCell>
                <TableCell className="text-xs font-medium">{row.actor}</TableCell>
                <TableCell className="text-xs">{row.action}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>{row.status}</Badge>
                </TableCell>
                <TableCell className="max-w-md truncate whitespace-normal text-xs text-muted-foreground">
                  {row.summary}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
