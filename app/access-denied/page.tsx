import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import SiteCreditFooter from "@/components/site-credit-footer";

export default function AccessDeniedPage() {
  return (
    <div className="gradient-hero flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md border-white/20 bg-white/10 backdrop-blur-md text-white shadow-2xl">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-400/20">
              <ShieldX className="h-6 w-6 text-red-200" />
            </div>
            <CardTitle className="text-2xl text-white">Access denied</CardTitle>
            <CardDescription className="text-white/70">
              This Google account is not allowed to use the EventClaim portal.
              Denied and revoked accounts cannot submit a new access request.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              asChild
              variant="outline"
              className="w-full border-0 bg-white text-primary shadow-md hover:bg-white/90"
            >
              <Link href="/login">Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      <SiteCreditFooter tone="dark" />
    </div>
  );
}
