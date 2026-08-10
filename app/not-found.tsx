import Link from "next/link";
import { ArrowLeft, Home, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import SiteCreditFooter from "@/components/site-credit-footer";
import { BrandMarkIcon } from "@/components/brand-mark";

export default function NotFound() {
  return (
    <div className="gradient-hero flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md space-y-8 text-left">
          <BrandMarkIcon size="md" className="text-white" />

          <div className="space-y-2">
            <p className="text-7xl font-bold tracking-tighter text-white/90 sm:text-8xl">
              404
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Page not found
            </h1>
            <p className="max-w-sm text-sm text-white/65">
              The page you&apos;re looking for doesn&apos;t exist or may have been
              moved. Check the URL or head back to a known destination.
            </p>
          </div>

          <Card className="border-white/15 bg-white/5 text-left text-white">
            <CardHeader className="space-y-1 pb-2">
              <CardTitle className="text-lg text-white">Cursor Community</CardTitle>
              <CardDescription className="text-white/65">
                Event coupon distribution
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                variant="outline"
                className="w-full border-0 bg-white text-foreground hover:bg-white/90 sm:w-auto"
              >
                <Link href="/check-status">
                  <Search className="h-4 w-4" />
                  Check coupon status
                </Link>
              </Button>
              <Button asChild className="w-full sm:w-auto bg-white/15 text-white hover:bg-white/25">
                <Link href="/dashboard">
                  <Home className="h-4 w-4" />
                  Admin dashboard
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Button
            asChild
            variant="ghost"
            className="text-white/70 hover:bg-white/10 hover:text-white"
          >
            <Link href="/login">
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Link>
          </Button>
        </div>
      </div>
      <SiteCreditFooter tone="dark" />
    </div>
  );
}
