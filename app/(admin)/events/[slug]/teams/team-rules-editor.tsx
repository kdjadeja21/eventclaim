"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { DEFAULT_TICKET_TYPE_MAP, TEAM_QUESTION_ID } from "@/lib/registrations";
import { Event, DEFAULT_TEAM_RULES } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateEventTeamSettings } from "./team-actions";

interface TeamRulesEditorProps {
  eventSlug: string;
  event: Event;
}

export default function TeamRulesEditor({ eventSlug, event }: TeamRulesEditorProps) {
  const rules = event.teamRules ?? DEFAULT_TEAM_RULES;
  const ticketMap = event.ticketTypeMap ?? DEFAULT_TICKET_TYPE_MAP;

  const [open, setOpen] = useState(false);
  const [minSize, setMinSize] = useState(String(rules.minSize));
  const [maxSize, setMaxSize] = useState(String(rules.maxSize));
  const [allowOversized, setAllowOversized] = useState(rules.allowOversized);
  const [teamQuestionId, setTeamQuestionId] = useState(event.teamQuestionId ?? TEAM_QUESTION_ID);
  const [createTicketTypeId, setCreateTicketTypeId] = useState(ticketMap.create_team?.[0] ?? "");
  const [joinTicketTypeId, setJoinTicketTypeId] = useState(ticketMap.join_team?.[0] ?? "");
  const [findTicketTypeId, setFindTicketTypeId] = useState(ticketMap.find_team?.[0] ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateEventTeamSettings(eventSlug, {
        minSize: Number(minSize),
        maxSize: Number(maxSize),
        allowOversized,
        teamQuestionId,
        createTicketTypeId,
        joinTicketTypeId,
        findTicketTypeId,
      });
      if (result.success) {
        toast.success("Team settings saved and teams rebuilt");
        setOpen(false);
        window.location.reload();
      } else {
        toast.error(result.error ?? "Failed to save settings");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Team rules
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Team formation settings</DialogTitle>
          <DialogDescription>
            Configure team size rules and Luma ticket type mapping for this event.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="minSize">Min team size</Label>
              <Input
                id="minSize"
                type="number"
                min={1}
                value={minSize}
                onChange={(e) => setMinSize(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxSize">Max team size</Label>
              <Input
                id="maxSize"
                type="number"
                min={1}
                value={maxSize}
                onChange={(e) => setMaxSize(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Allow oversized teams</p>
              <p className="text-xs text-muted-foreground">
                Skip size_over issues when teams exceed max size
              </p>
            </div>
            <Switch checked={allowOversized} onCheckedChange={setAllowOversized} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="teamQuestionId">Team answer question ID</Label>
            <Input
              id="teamQuestionId"
              value={teamQuestionId}
              onChange={(e) => setTeamQuestionId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="createTicket">Create-a-Team ticket type ID</Label>
            <Input
              id="createTicket"
              value={createTicketTypeId}
              onChange={(e) => setCreateTicketTypeId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="joinTicket">Join-a-Team ticket type ID</Label>
            <Input
              id="joinTicket"
              value={joinTicketTypeId}
              onChange={(e) => setJoinTicketTypeId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="findTicket">Find-me-a-Team ticket type ID</Label>
            <Input
              id="findTicket"
              value={findTicketTypeId}
              onChange={(e) => setFindTicketTypeId(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save &amp; rebuild
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
