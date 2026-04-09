import React from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Palette } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

const themeOptions = [
  { id: "classic", label: "Classic", color: "bg-slate-100", border: "border-slate-300" },
  { id: "modern", label: "Modern", color: "bg-slate-900", border: "border-slate-700" },
  { id: "minimal", label: "Minimal", color: "bg-white", border: "border-black" },
  { id: "retro", label: "Retro", color: "bg-[#f0eadd]", border: "border-[#b8a07e]" },
  { id: "futuristic", label: "Futuristic", color: "bg-black", border: "border-cyan-500" },
] as const;

type ThemeOptionId = (typeof themeOptions)[number]["id"];

function isThemeOption(value: string): value is ThemeOptionId {
  return themeOptions.some((theme) => theme.id === value);
}

const Settings = () => {
  const { theme, setTheme } = useTheme();

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Configure the dashboard look and feel.
          </p>
        </div>

        <Separator className="my-6" />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Theme Configuration
            </CardTitle>
            <CardDescription>
              Choose the visual style for your dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={theme}
              onValueChange={(value) => {
                if (isThemeOption(value)) {
                  setTheme(value);
                }
              }}
              className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 pt-4"
            >
              {themeOptions.map((option) => {
                const isSelected = theme === option.id;
                const isDarkPreview = option.id === "modern" || option.id === "futuristic";

                return (
                  <div key={option.id} className="flex flex-col space-y-2">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value={option.id} id={`theme-${option.id}`} />
                      <Label htmlFor={`theme-${option.id}`} className="font-medium cursor-pointer">
                        {option.label}
                      </Label>
                    </div>

                    <Label
                      htmlFor={`theme-${option.id}`}
                      className={`cursor-pointer border-2 rounded-lg p-4 h-24 flex items-center justify-center transition-all ${option.color} ${option.border} ${isSelected ? "ring-2 ring-primary ring-offset-2" : "hover:opacity-80"}`}
                    >
                      <div className="flex flex-col gap-2 w-full">
                        <div className={`h-2 w-3/4 rounded-full ${isDarkPreview ? "bg-slate-700" : "bg-slate-300"}`} />
                        <div className={`h-2 w-1/2 rounded-full ${isDarkPreview ? "bg-slate-700" : "bg-slate-300"}`} />
                      </div>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
