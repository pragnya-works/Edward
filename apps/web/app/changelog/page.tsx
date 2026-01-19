import { Metadata } from "next";
import { getLinearIssues, groupAndSortIssues } from "@/lib/linear";
import { ChangelogHeader } from "@/components/changelog/header";
import { IssueCard } from "@/components/changelog/issueCard";
import { Card, CardContent } from "@workspace/ui/components/card";
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@workspace/ui/components/accordion";
import { AlertCircle, Tag } from "lucide-react";
import { Badge } from "@workspace/ui/components/badge";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Changelog",
  description: "Stay up to date with the latest improvements, features, and fixes we've shipped.",
};

export default async function ChangelogPage() {
  const { issues, error } = await getLinearIssues();
  const { categorizedIssues, sortedLabels } = groupAndSortIssues(issues);

  return (
    <div className="container mx-auto max-w-4xl py-12 px-4 md:px-6">
      <ChangelogHeader />

      {error ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <AlertCircle className="mb-4 h-10 w-10 text-destructive" />
            <h3 className="text-lg font-semibold text-destructive">Unable to Load Issues</h3>
            <p className="text-sm text-muted-foreground">
              {error === "Missing LINEAR_API_KEY environment variable"
                ? "Please configure the LINEAR_API_KEY environment variable."
                : "There was an error connecting to Linear."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {issues.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              No changelog items found yet. Check back soon!
            </div>
          ) : (
            <Accordion type="multiple" defaultValue={sortedLabels} className="w-full space-y-4">
              {sortedLabels.map((label) => (
                <AccordionItem key={label} value={label} className="border-none">
                  <AccordionTrigger className="hover:no-underline py-2">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-primary" />
                      <span className="text-lg font-semibold capitalize">{label}</span>
                      <Badge variant="secondary" className="ml-2 font-mono text-xs">
                        {categorizedIssues[label]?.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-4">
                    <div className="grid gap-4">
                      {categorizedIssues[label]?.map((issue) => (
                        <IssueCard key={issue.id} issue={issue} />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      )}
    </div>
  );
}