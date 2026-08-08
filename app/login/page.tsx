import { isLoadTestEnabled } from "@/lib/load-test-config";
import LoginForm from "./login-form";

export default function LoginPage() {
  return <LoginForm loadTestEnabled={isLoadTestEnabled()} />;
}
