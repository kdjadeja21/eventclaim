import Link from "next/link";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import SiteCreditFooter from "@/components/site-credit-footer";

export default function AccessPendingPage() {
  return (
    <div className="gradient-hero flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md border-white/20 bg-white/10 backdrop-blur-md text-white shadow-2xl">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-400/20">
              <Clock className="h-6 w-6 text-amber-200" />
            </div>
            <CardTitle className="text-2xl text-white">Request raised</CardTitle>
            <CardDescription className="text-white/70">
              Your access request for the EventClaim portal has been submitted.
              An administrator must approve it before you can sign in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-center text-sm text-white/60">
              You will be able to use the portal once your account is approved.
              Signing in again while pending will not create a duplicate request.
            </p>
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
