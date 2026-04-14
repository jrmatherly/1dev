import { useState, useEffect } from "react";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { AvatarWithInitials } from "../../ui/avatar-with-initials";
import { IconSpinner } from "../../../icons";
import { trpc } from "../../../lib/trpc";

// Hook to detect narrow screen
function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth <= 768);
    };

    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

  return isNarrow;
}

interface DesktopUser {
  id: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  username: string | null;
}

export function AgentsProfileTab() {
  const [user, setUser] = useState<DesktopUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isNarrowScreen = useIsNarrowScreen();

  // Microsoft Graph /me profile + avatar (enterprise mode only). Returns null
  // when enterprise auth is off, consent is missing, or the call fails — the
  // fallback is the existing `user` fields from desktopApi.getUser() plus
  // the `<AvatarWithInitials>` initials-only bubble.
  const graphProfile = trpc.enterpriseAuth.getGraphProfile.useQuery(undefined, {
    staleTime: 1000 * 60 * 60, // 1h — photo and department don't change often
    retry: false, // the procedure returns null on error, so retries are noise
  });

  // Fetch real user data from desktop API
  useEffect(() => {
    async function fetchUser() {
      if (window.desktopApi?.getUser) {
        const userData = await window.desktopApi.getUser();
        setUser(userData);
      }
      setIsLoading(false);
    }
    fetchUser();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <IconSpinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Profile Settings Card */}
      <div className="space-y-2">
        {/* Header - hidden on narrow screens since it's in the navigation bar */}
        {!isNarrowScreen && (
          <div className="flex items-center justify-between pb-3 mb-4">
            <h3 className="text-sm font-medium text-foreground">Account</h3>
          </div>
        )}
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          {/* Identity header — Graph photo (or initials fallback) + display name */}
          <div className="flex items-center gap-4 p-4">
            <AvatarWithInitials
              avatarDataUrl={graphProfile.data?.avatarDataUrl ?? null}
              displayName={
                graphProfile.data?.displayName || user?.name || ""
              }
              email={user?.email ?? null}
              oid={user?.id ?? ""}
              size="lg"
            />
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-foreground truncate">
                {graphProfile.data?.displayName || user?.name || ""}
              </p>
            </div>
          </div>

          {/* Email Field (read-only) */}
          <div className="flex items-center justify-between p-4 border-t border-border">
            <div className="flex-1">
              <Label className="text-sm font-medium">Email</Label>
              <p className="text-sm text-muted-foreground">
                Your account email
              </p>
            </div>
            <div className="shrink-0 w-80">
              <Input
                value={user?.email || ""}
                disabled
                className="w-full opacity-60"
              />
            </div>
          </div>

          {/* Graph profile fields — hidden when the field is empty to avoid
              rendering "(empty)" rows for users without these attributes. */}
          {graphProfile.data?.jobTitle && (
            <div className="flex items-center justify-between p-4 border-t border-border">
              <div className="flex-1">
                <Label className="text-sm font-medium">Job Title</Label>
                <p className="text-sm text-muted-foreground">
                  From your Microsoft 365 profile
                </p>
              </div>
              <div className="shrink-0 w-80">
                <Input
                  value={graphProfile.data.jobTitle}
                  disabled
                  className="w-full opacity-60"
                />
              </div>
            </div>
          )}

          {graphProfile.data?.department && (
            <div className="flex items-center justify-between p-4 border-t border-border">
              <div className="flex-1">
                <Label className="text-sm font-medium">Department</Label>
                <p className="text-sm text-muted-foreground">
                  From your Microsoft 365 profile
                </p>
              </div>
              <div className="shrink-0 w-80">
                <Input
                  value={graphProfile.data.department}
                  disabled
                  className="w-full opacity-60"
                />
              </div>
            </div>
          )}

          {graphProfile.data?.officeLocation && (
            <div className="flex items-center justify-between p-4 border-t border-border">
              <div className="flex-1">
                <Label className="text-sm font-medium">Office Location</Label>
                <p className="text-sm text-muted-foreground">
                  From your Microsoft 365 profile
                </p>
              </div>
              <div className="shrink-0 w-80">
                <Input
                  value={graphProfile.data.officeLocation}
                  disabled
                  className="w-full opacity-60"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
