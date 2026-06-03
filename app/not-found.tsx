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

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center gradient-hero px-4 py-16">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="flex justify-center">
          <div className="h-12 w-12 rounded-full gradient-brand flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-xl">C</span>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-7xl font-bold tracking-tighter gradient-text sm:text-8xl">
            404
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Page not found
          </h1>
          <p className="text-sm text-white/70 max-w-sm mx-auto">
            The page you&apos;re looking for doesn&apos;t exist or may have been
            moved. Check the URL or head back to a known destination.
          </p>
        </div>

        <Card className="border-white/20 bg-white/10 backdrop-blur-md text-white shadow-2xl text-left">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-lg text-white">Cursor Community</CardTitle>
            <CardDescription className="text-white/70">
              Event Coupon Distribution Platform
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              asChild
              variant="outline"
              className="w-full sm:w-auto bg-white text-primary border-0 hover:bg-white/90 shadow-md"
            >
              <Link href="/check-status">
                <Search className="h-4 w-4" />
                Check coupon status
              </Link>
            </Button>
            <Button asChild className="w-full sm:w-auto">
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
          className="text-white/70 hover:text-white hover:bg-white/10"
        >
          <Link href="/login">
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </Button>
      </div>
    </div>
  );
}
