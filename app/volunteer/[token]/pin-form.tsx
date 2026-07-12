"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { verifyVolunteerPin } from "./volunteer-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PinForm({ token, volunteerName }: { token: string; volunteerName: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length !== 4) return;
    setLoading(true);
    setError(null);

    try {
      const res = await verifyVolunteerPin(token, pin);
      if (res.success) {
        router.refresh();
      } else {
        setError(res.error ?? "Incorrect PIN.");
        setPin("");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50/80">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto h-10 w-10 rounded-full gradient-brand flex items-center justify-center shadow-md mb-2">
            <Lock className="h-5 w-5 text-white" />
          </div>
          <CardTitle>Hi, {volunteerName}</CardTitle>
          <CardDescription>Enter your 4-digit PIN to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="pin" className="sr-only">
                PIN
              </Label>
              <Input
                id="pin"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="text-center text-2xl tracking-[0.5em] font-mono h-14"
                placeholder="••••"
              />
            </div>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button type="submit" className="w-full" disabled={pin.length !== 4 || loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
