import { useCallback, useEffect, useState } from "react";
import { useGetIdentity } from "@refinedev/core";
import {
  AtSign,
  FileText,
  Loader2,
  Mail,
  MoreHorizontal,
  PenLine,
  Plus,
  RefreshCw,
  Settings,
  Star,
  Tags,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { mailApi } from "./mail-api";
import { MailLabelManager } from "./mail-label-manager";
import { MailTemplateManager } from "./mail-template-manager";
import { MailSignatureManager } from "./mail-signature-manager";
import { useMailTemplates } from "./use-mail-templates";
import { useMailSignatures } from "./use-mail-signatures";
import type { MailAccount, MailLabel } from "./types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface MailSettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EmptySetting({ children }: { children: string }) {
  return (
    <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function MailSettingsDrawer({
  open,
  onOpenChange,
}: MailSettingsDrawerProps) {
  const { data: identity } = useGetIdentity<{ id: number | string }>();
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [labels, setLabels] = useState<MailLabel[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncingEmail, setSyncingEmail] = useState<string>();
  const [selectedAccountId, setSelectedAccountId] = useState<number>();
  const [deleteAccount, setDeleteAccount] = useState<MailAccount>();
  const [resyncAccount, setResyncAccount] = useState<MailAccount>();
  const [senderAccount, setSenderAccount] = useState<MailAccount>();
  const [aliasAccount, setAliasAccount] = useState<MailAccount>();
  const [syncingAliases, setSyncingAliases] = useState(false);
  const [senderName, setSenderName] = useState("");
  const [savingSender, setSavingSender] = useState(false);
  const templates = useMailTemplates();
  const selectedAccount = accounts.find(
    (account) => account.id === selectedAccountId
  );
  const signatures = useMailSignatures(selectedAccount, (updated) => {
    setAccounts((current) =>
      current.map((account) => (account.id === updated.id ? updated : account))
    );
  });

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [nextAccounts, nextLabels] = await Promise.all([
        mailApi.getAccounts(),
        mailApi.getLabels(identity?.id),
      ]);
      setAccounts(nextAccounts);
      setLabels(nextLabels);
      setSelectedAccountId((current) =>
        nextAccounts.some((account) => account.id === current)
          ? current
          : nextAccounts[0]?.id
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load mail settings"
      );
    } finally {
      setLoading(false);
    }
  }, [identity?.id]);

  useEffect(() => {
    if (open) void loadSettings();
  }, [loadSettings, open]);

  useEffect(() => {
    if (!open) return;
    const refreshOnFocus = () => void loadSettings();
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [loadSettings, open]);

  const openOAuth = async (
    type: "google" | "microsoft",
    options?: { email?: string; reauthorize?: boolean }
  ) => {
    try {
      const url = await mailApi.getOAuthUrl(type, options);
      if (!url) throw new Error("Authorization URL was not returned");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start authorization"
      );
    }
  };

  const reauthorize = (account: MailAccount) => {
    if (account.type !== "google" && account.type !== "microsoft") {
      toast.error(`Unsupported mailbox type: ${account.type}`);
      return;
    }
    void openOAuth(account.type, { email: account.email, reauthorize: true });
  };

  const syncAccount = async (account: MailAccount) => {
    setSyncingEmail(account.email);
    try {
      await mailApi.sync([account.email]);
      toast.success(`${account.email} synced`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Mailbox sync failed"
      );
    } finally {
      setSyncingEmail(undefined);
    }
  };

  const confirmDeleteAccount = async () => {
    if (!deleteAccount) return;
    setSyncingEmail(deleteAccount.email);
    try {
      await mailApi.deleteAccount(deleteAccount.email);
      toast.success("Mailbox deleted");
      setDeleteAccount(undefined);
      await loadSettings();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Mailbox deletion failed"
      );
    } finally {
      setSyncingEmail(undefined);
    }
  };

  const confirmResyncAccount = async () => {
    if (!resyncAccount) return;
    setSyncingEmail(resyncAccount.email);
    try {
      await mailApi.resyncAccount(resyncAccount.email);
      toast.success("Mailbox resync completed");
      setResyncAccount(undefined);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Mailbox resync failed"
      );
    } finally {
      setSyncingEmail(undefined);
    }
  };

  const editSenderName = (account: MailAccount) => {
    setSenderAccount(account);
    setSenderName(
      typeof account.config?.displayName === "string"
        ? account.config.displayName
        : ""
    );
  };

  const syncAliases = async () => {
    if (!aliasAccount) return;
    setSyncingAliases(true);
    try {
      const identities = await mailApi.syncAliases(aliasAccount.email);
      const updated = { ...aliasAccount, identities };
      setAliasAccount(updated);
      setAccounts((current) =>
        current.map((account) =>
          account.id === updated.id ? updated : account
        )
      );
      toast.success("Aliases synced");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to sync aliases"
      );
    } finally {
      setSyncingAliases(false);
    }
  };

  const saveSenderName = async () => {
    if (!senderAccount) return;
    setSavingSender(true);
    try {
      const config = {
        ...(senderAccount.config ?? {}),
        displayName: senderName.trim(),
      };
      const updated = await mailApi.updateAccount(senderAccount.id, { config });
      setAccounts((current) =>
        current.map((account) =>
          account.id === senderAccount.id
            ? { ...account, ...updated, config: updated.config ?? config }
            : account
        )
      );
      setSenderAccount(undefined);
      toast.success("Sender name saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save sender name"
      );
    } finally {
      setSavingSender(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 data-[side=right]:sm:max-w-3xl"
        >
          <SheetHeader className="border-b px-6 py-5">
            <div className="flex items-center gap-2">
              <Settings className="size-4 text-muted-foreground" />
              <SheetTitle>Mail settings</SheetTitle>
            </div>
            <SheetDescription>
              Manage personal mailboxes and reusable message content.
            </SheetDescription>
          </SheetHeader>

          <Tabs defaultValue="mailbox" className="min-h-0 flex-1 gap-0">
            <div className="border-b px-6 py-3">
              <TabsList variant="line" className="h-9">
                <TabsTrigger value="mailbox">
                  <Mail /> Mailbox
                </TabsTrigger>
                <TabsTrigger value="labels">
                  <Tags /> Labels
                </TabsTrigger>
                <TabsTrigger value="templates">
                  <FileText /> Templates
                </TabsTrigger>
                <TabsTrigger value="signature">
                  <Star /> Signature
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <TabsContent value="mailbox" className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Connected mailboxes</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      View and sync the mailboxes available to your account.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void loadSettings()}
                      disabled={loading}
                    >
                      <RefreshCw
                        className={loading ? "animate-spin" : undefined}
                      />{" "}
                      Refresh
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button size="sm">
                            <Plus /> Link email
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          onClick={() => void openOAuth("google")}
                        >
                          <Mail /> Gmail
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => void openOAuth("microsoft")}
                        >
                          <Mail /> Outlook
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {loading && !accounts.length ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="animate-spin text-muted-foreground" />
                  </div>
                ) : accounts.length ? (
                  <div className="divide-y overflow-hidden rounded-xl border bg-card">
                    {accounts.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center gap-4 px-4 py-3.5"
                      >
                        <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                          <Mail className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {account.email}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {account.identities?.filter(
                              (identity) => !identity.isPrimary
                            ).length ?? 0}{" "}
                            aliases
                          </span>
                        </span>
                        <Badge variant="outline" className="capitalize">
                          {account.type}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={syncingEmail === account.email}
                          onClick={() => void syncAccount(account)}
                        >
                          <RefreshCw
                            className={
                              syncingEmail === account.email
                                ? "animate-spin"
                                : undefined
                            }
                          />
                          Sync
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title={`Manage ${account.email}`}
                              >
                                <MoreHorizontal />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={() => reauthorize(account)}
                            >
                              <RefreshCw /> Reauthorize
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setAliasAccount(account)}
                            >
                              <AtSign /> Aliases
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={account.type === "microsoft"}
                              onClick={() => editSenderName(account)}
                            >
                              <PenLine /> Sender name
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setResyncAccount(account)}
                            >
                              <RefreshCw /> Resync
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleteAccount(account)}
                            >
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptySetting>No connected mailboxes</EmptySetting>
                )}
              </TabsContent>

              <TabsContent value="labels" className="space-y-4">
                <div>
                  <h3 className="font-semibold">Labels</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Create and organize reusable message labels.
                  </p>
                </div>
                <MailLabelManager
                  embedded
                  open
                  onOpenChange={() => undefined}
                  labels={labels}
                  onChange={setLabels}
                />
              </TabsContent>

              <TabsContent value="templates" className="space-y-4">
                <div>
                  <h3 className="font-semibold">Templates</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Manage reusable content for new messages.
                  </p>
                </div>
                <MailTemplateManager
                  embedded
                  open
                  onOpenChange={() => undefined}
                  templates={templates.templates}
                  onCreate={templates.create}
                  onUpdate={templates.update}
                  onRemove={templates.remove}
                />
              </TabsContent>

              <TabsContent value="signature" className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-56 space-y-1.5">
                    <h3 className="font-semibold">Signature</h3>
                    <Select
                      value={
                        selectedAccountId
                          ? String(selectedAccountId)
                          : undefined
                      }
                      onValueChange={(value) =>
                        setSelectedAccountId(Number(value))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select mailbox" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem
                            key={account.id}
                            value={String(account.id)}
                          >
                            {account.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {selectedAccount ? (
                  <MailSignatureManager
                    embedded
                    open
                    onOpenChange={() => undefined}
                    signatures={signatures.signatures}
                    onCreate={signatures.create}
                    onUpdate={signatures.update}
                    onRemove={signatures.remove}
                    onSetDefault={signatures.setDefault}
                  />
                ) : (
                  <EmptySetting>Select a mailbox</EmptySetting>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(senderAccount)}
        onOpenChange={(nextOpen) => !nextOpen && setSenderAccount(undefined)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sender name</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="mail-sender-name">Display name</Label>
            <Input
              id="mail-sender-name"
              value={senderName}
              onChange={(event) => setSenderName(event.target.value)}
              placeholder="Name shown to recipients"
            />
            <p className="text-xs text-muted-foreground">
              Applies to {senderAccount?.email}. Outlook does not support this
              setting.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSenderAccount(undefined)}
            >
              Cancel
            </Button>
            <Button
              disabled={savingSender}
              onClick={() => void saveSenderName()}
            >
              {savingSender && <Loader2 className="animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(aliasAccount)}
        onOpenChange={(nextOpen) => !nextOpen && setAliasAccount(undefined)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mailbox aliases</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {aliasAccount?.email}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Primary sender address
                </p>
              </div>
              <Badge variant="outline">Primary</Badge>
            </div>

            {aliasAccount?.type === "microsoft" ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Outlook does not expose sender aliases through this integration.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold">Available aliases</h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Synced from Gmail and available in the sender selector.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={syncingAliases}
                    onClick={() => void syncAliases()}
                  >
                    <RefreshCw
                      className={syncingAliases ? "animate-spin" : undefined}
                    />
                    Sync aliases
                  </Button>
                </div>
                {aliasAccount?.identities?.filter(
                  (mailIdentity) =>
                    !mailIdentity.isPrimary &&
                    mailIdentity.email.toLocaleLowerCase() !==
                      aliasAccount.email.toLocaleLowerCase()
                ).length ? (
                  <div className="divide-y overflow-hidden rounded-lg border">
                    {aliasAccount.identities
                      .filter(
                        (mailIdentity) =>
                          !mailIdentity.isPrimary &&
                          mailIdentity.email.toLocaleLowerCase() !==
                            aliasAccount.email.toLocaleLowerCase()
                      )
                      .map((mailIdentity) => (
                        <div
                          key={mailIdentity.id}
                          className="flex items-center gap-3 px-3 py-2.5"
                        >
                          <AtSign className="size-4 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {mailIdentity.email}
                          </span>
                          {mailIdentity.name ? (
                            <span className="truncate text-xs text-muted-foreground">
                              {mailIdentity.name}
                            </span>
                          ) : null}
                        </div>
                      ))}
                  </div>
                ) : (
                  <EmptySetting>No aliases found</EmptySetting>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAliasAccount(undefined)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(resyncAccount)}
        onOpenChange={(nextOpen) => !nextOpen && setResyncAccount(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resync this mailbox?</AlertDialogTitle>
            <AlertDialogDescription>
              This performs a full sync for {resyncAccount?.email}, may take
              some time, and rebuilds its conversation threads.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(syncingEmail)}
              onClick={() => void confirmResyncAccount()}
            >
              Resync
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteAccount)}
        onOpenChange={(nextOpen) => !nextOpen && setDeleteAccount(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this mailbox?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {deleteAccount?.email} and its locally stored
              messages. The operation may take some time and cannot be undone
              here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(syncingEmail)}
              onClick={() => void confirmDeleteAccount()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
