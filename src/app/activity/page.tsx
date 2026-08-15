import { redirect } from "next/navigation";
import { getCurrentWorld } from "../current-world";
import { getActivity } from "@/lib/db/queries";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ok: "secondary",
  blocked: "destructive",
  quarantined: "destructive",
  failed: "destructive",
};

export default async function ActivityPage() {
  const world = await getCurrentWorld();
  if (!world) redirect("/onboarding");

  const rows = getActivity(world.id, 200);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div>
        <h1 className="font-heading text-xl font-semibold">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every agent step, guardrail block, and human decision, newest first.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Sim time</TableHead>
                <TableHead className="w-28">Actor</TableHead>
                <TableHead className="w-32">Action</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No activity yet — run a heartbeat.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{row.label}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {row.actor}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{row.action}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.status] ?? "outline"} className="text-[10px]">
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.summary}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
