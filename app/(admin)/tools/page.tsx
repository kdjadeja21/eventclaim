import { 
  ExternalLink, 
  Wrench, 
  QrCode, 
  Timer as TimerIcon, 
  Image as ImageIcon, 
  PartyPopper 
} from "lucide-react";
import { Button } from "@/components/ui/button";

const tools = [
  {
    id: "cursor-welcome",
    label: "Cursor Welcome",
    description: "Welcome page for new Cursor community members.",
    url: "https://cursor-welcome.vercel.app/",
    icon: PartyPopper,
    color: "from-violet-500 to-indigo-600",
    bgLight: "bg-violet-100 dark:bg-violet-500/20",
    textAccent: "text-violet-600 dark:text-violet-400"
  },
  {
    id: "cursor-qr",
    label: "Cursor QR",
    description: "Generate QR codes for Cursor community links and events.",
    url: "https://cursor-qr.vercel.app/",
    icon: QrCode,
    color: "from-emerald-500 to-teal-600",
    bgLight: "bg-emerald-100 dark:bg-emerald-500/20",
    textAccent: "text-emerald-600 dark:text-emerald-400"
  },
  {
    id: "timer",
    label: "Timer",
    description: "Countdown and session timer for workshops and talks.",
    url: "https://timer21.vercel.app/",
    icon: TimerIcon,
    color: "from-orange-500 to-rose-600",
    bgLight: "bg-orange-100 dark:bg-orange-500/20",
    textAccent: "text-orange-600 dark:text-orange-400"
  },
  {
    id: "thumbnail-tool",
    label: "Thumbnail Tool",
    description: "Create and customize thumbnails for community content.",
    url: "https://cursor-thumbnail-tool.vercel.app/",
    icon: ImageIcon,
    color: "from-sky-500 to-blue-600",
    bgLight: "bg-sky-100 dark:bg-sky-500/20",
    textAccent: "text-sky-600 dark:text-sky-400"
  },
];

export default function ToolsPage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg gradient-brand flex items-center justify-center shadow-md">
          <Wrench className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Community Tools</h1>
          <p className="text-sm text-muted-foreground">
            A collection of internal tools to help manage community events and content.
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
            className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-5 overflow-hidden shadow-sm hover:shadow-md hover:border-border transition-all duration-200 hover:-translate-y-1"
          >
            {/* Top decorative gradient line */}
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${tool.color} opacity-70 group-hover:opacity-100 transition-opacity`} />
            
            <div className="flex flex-col gap-4">
              {/* Icon */}
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${tool.bgLight} transition-colors`}>
                <tool.icon className={`h-6 w-6 ${tool.textAccent}`} />
              </div>

              {/* Text */}
              <div>
                <h3 className="font-semibold text-base text-foreground mb-1 group-hover:text-foreground transition-colors">
                  {tool.label}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                  {tool.description}
                </p>
              </div>
            </div>

            {/* Action Area */}
            <div className="mt-6 flex items-center justify-between">
              <span className={`text-sm font-medium ${tool.textAccent} flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity`}>
                Open Tool
              </span>
              <div className={`h-8 w-8 rounded-full flex items-center justify-center ${tool.bgLight} group-hover:bg-gradient-to-br group-hover:${tool.color} transition-all duration-300`}>
                <ExternalLink className={`h-4 w-4 ${tool.textAccent} group-hover:text-white transition-colors`} />
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
