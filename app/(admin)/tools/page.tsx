import {
  ExternalLink,
  Wrench,
  QrCode,
  Timer as TimerIcon,
  Image as ImageIcon,
  PartyPopper,
} from "lucide-react";

const tools = [
  {
    id: "cursor-welcome",
    label: "Cursor Welcome",
    description: "Welcome page for new Cursor community members.",
    url: "https://cursor-welcome.vercel.app/",
    icon: PartyPopper,
  },
  {
    id: "cursor-qr",
    label: "Cursor QR",
    description: "Generate QR codes for Cursor community links and events.",
    url: "https://cursor-qr.vercel.app/",
    icon: QrCode,
  },
  {
    id: "timer",
    label: "Timer",
    description: "Countdown and session timer for workshops and talks.",
    url: "https://timer21.vercel.app/",
    icon: TimerIcon,
  },
  {
    id: "thumbnail-tool",
    label: "Thumbnail tool",
    description: "Create and customize thumbnails for community content.",
    url: "https://cursor-thumbnail-tool.vercel.app/",
    icon: ImageIcon,
  },
];

export default function ToolsPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-md bg-primary flex items-center justify-center">
          <Wrench className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Community tools
          </h1>
          <p className="text-sm text-muted-foreground">
            Internal tools for community events and content.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
        {tools.map((tool) => (
          <a
            key={tool.id}
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col justify-between rounded-lg border border-border bg-card p-5 transition-colors duration-200 ease-[var(--ease-out-spring)] hover:bg-muted/60"
          >
            <div className="flex flex-col gap-4">
              <div className="h-10 w-10 rounded-md flex items-center justify-center bg-muted text-foreground">
                <tool.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-base text-foreground mb-1">
                  {tool.label}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                  {tool.description}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <span className="text-sm font-medium text-accent flex items-center gap-1.5">
                Open tool
              </span>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
