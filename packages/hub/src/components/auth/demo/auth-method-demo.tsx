import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AuthMethodDemo({
  authType,
  children,
  description,
  methodName,
}: {
  authType: string;
  children: React.ReactNode;
  description: string;
  methodName: string;
}) {
  return (
    <div className="space-y-8 pb-12">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Authentication</Badge>
          <Badge variant="outline">{authType}</Badge>
        </div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {methodName}
        </h1>
        <p className="max-w-3xl text-muted-foreground">{description}</p>
      </header>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Default component</CardTitle>
          <CardDescription>
            Installed Registries add this UI to the dynamic login page
            automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm">{children}</div>
        </CardContent>
      </Card>
    </div>
  );
}
