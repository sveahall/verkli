"use client";

import dynamic from "next/dynamic";
import GenreSelector from "@/components/books/GenreSelector";
import DeleteBookButton from "@/components/books/DeleteBookButton";
import { getMarketingEnabled, getRecommendationsEnabled, getTranslationsEnabled } from "@/lib/flags";
import { type SupportedLanguage } from "@/lib/languages";
import BookWorkflowHeader from "../BookWorkflowHeader";
import ImportManusSection from "./components/ImportManusSection";
import type {
  BookVersion,
  Chapter,
  MarketingCampaignRow,
  Tool,
} from "./BookEditorView.types";
import type { PrintOnDemandSettings } from "./panels/PrintPanel.helpers";
import type { useBookCover } from "./hooks/useBookCover";
import type { useAudiobook } from "./hooks/useAudiobook";
import type { useTranslation } from "./hooks/useTranslation";
import type { usePublishing } from "./hooks/usePublishing";
import type { useBookPricing } from "./hooks/useBookPricing";
import type { useMarketing } from "./hooks/useMarketing";
import type { useBillingState } from "@/hooks/useBillingState";

const PrintPanel = dynamic(() => import("./panels/PrintPanel"));
const TranslatePanel = dynamic(() => import("./panels/TranslatePanel"));
const ReviewPanel = dynamic(() => import("./panels/ReviewPanel"));
const PublishPanel = dynamic(() => import("./panels/PublishPanel"));
const MarketPanel = dynamic(() => import("./panels/MarketPanel"));
const TrailerPanel = dynamic(() => import("./panels/TrailerPanel"));
const StatisticsPanel = dynamic(() => import("./panels/StatisticsPanel"));
const AudiobookPanel = dynamic(() => import("./panels/AudiobookPanel"));
const CoverPanel = dynamic(() => import("./panels/CoverPanel"));
const PricingPanel = dynamic(() => import("./panels/PricingPanel"));

interface BookEditorPanelContentProps {
  bookId: string;
  bookTitle: string;
  bookDescription: string | null;
  bookOriginalUrl: string | null;
  bookAudiobookStatus: string | null;
  bookTrailerStatus: string | null;
  bookTrailerUrl: string | null;
  authorDisplayName: string;
  tool: Tool;
  tools: Tool[];
  chapters: Chapter[];
  activeVersion: BookVersion | null;
  activeLanguage: string;
  bookVersions: BookVersion[];
  totalBookWordCount: number;
  selectedChapterId: string | null;
  selectedChapter: Chapter | null;
  importJobs: ReturnType<typeof Array.prototype.filter>;
  stripeConfigured: boolean;
  marketingCampaigns: MarketingCampaignRow[];
  printOnDemandSettings: PrintOnDemandSettings;
  onSavePrintOnDemandSettings: (settings: PrintOnDemandSettings) => Promise<{ ok: true } | { ok: false; message: string }>;
  onNavigateToPanel: (panel: Tool) => void;
  onSetSelectedChapterId: (id: string) => void;
  onResetSessionWords: () => void;
  cover: ReturnType<typeof useBookCover>;
  audiobook: ReturnType<typeof useAudiobook> & { bookLanguage: string | null; bookOriginalLanguage: string | null };
  translation: Pick<ReturnType<typeof useTranslation>, "translationSourceLang" | "setTranslateMessage">;
  publishing: ReturnType<typeof usePublishing>;
  pricing: ReturnType<typeof useBookPricing>;
  marketing: Pick<ReturnType<typeof useMarketing>, "isGeneratingMarketing" | "setMarketingChannel" | "setMarketingLanguage" | "handleGenerateMarketingCopy">;
  billing: Pick<ReturnType<typeof useBillingState>, "loading" | "isProActive">;
  refetchBookJob: () => Promise<void>;
}

export default function BookEditorPanelContent({
  bookId,
  bookTitle,
  bookDescription,
  bookOriginalUrl,
  authorDisplayName,
  tool,
  tools,
  chapters,
  activeVersion,
  activeLanguage,
  bookVersions,
  totalBookWordCount,
  selectedChapterId,
  selectedChapter: _selectedChapter, // eslint-disable-line @typescript-eslint/no-unused-vars
  importJobs,
  stripeConfigured,
  marketingCampaigns,
  printOnDemandSettings,
  onSavePrintOnDemandSettings,
  onNavigateToPanel,
  onSetSelectedChapterId,
  onResetSessionWords,
  cover,
  audiobook,
  translation,
  publishing,
  pricing,
  marketing,
  billing,
  refetchBookJob,
  bookAudiobookStatus,
  bookTrailerStatus,
  bookTrailerUrl,
}: BookEditorPanelContentProps) {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-white/[0.06] dark:bg-[#111318] dark:shadow-none">
      <BookWorkflowHeader
        bookId={bookId}
        activeTool={tool}
        tools={tools}
        bare
        compact
      />
      <div className="min-h-[calc(100vh-14rem)] px-6 pb-10 pt-4 sm:px-10">

        {tool === "cover" && (
          <CoverPanel
            coverInputRef={cover.coverInputRef}
            coverUploading={cover.coverUploading}
            coverError={cover.coverError}
            displayCoverUrl={cover.displayCoverUrl}
            coverDropActive={cover.coverDropActive}
            setCoverDropActive={cover.setCoverDropActive}
            coverAIPrompt={cover.coverAIPrompt}
            setCoverAIPrompt={cover.setCoverAIPrompt}
            coverAIStyle={cover.coverAIStyle}
            setCoverAIStyle={cover.setCoverAIStyle}
            coverAIGeneratedUrls={cover.coverAIGeneratedUrls}
            coverAIGenerating={cover.coverAIGenerating}
            coverAIError={cover.coverAIError}
            setCoverAIError={cover.setCoverAIError}
            coverCropSrc={cover.coverCropSrc}
            setCoverCropSrc={cover.setCoverCropSrc}
            coverAIPreviewUrl={cover.coverAIPreviewUrl}
            setCoverAIPreviewUrl={cover.setCoverAIPreviewUrl}
            handleRemoveCover={cover.handleRemoveCover}
            handleCropSave={cover.handleCropSave}
            handleCoverChange={cover.handleCoverChange}
            handleCoverDrop={cover.handleCoverDrop}
            handleCoverAIGenerate={cover.handleCoverAIGenerate}
            handleCoverSetFromGenerated={cover.handleCoverSetFromGenerated}
            coverAITemplate={cover.coverAITemplate}
            setCoverAITemplate={cover.setCoverAITemplate}
            coverAITemplateFields={cover.coverAITemplateFields}
            setCoverAITemplateFields={cover.setCoverAITemplateFields}
            coverEditorOpen={cover.coverEditorOpen}
            setCoverEditorOpen={cover.setCoverEditorOpen}
            handleEditorSave={cover.handleEditorSave}
            bookId={bookId}
            bookTitle={bookTitle}
            authorName={authorDisplayName}
          />
        )}

        {tool === "audiobook" && (
          <AudiobookPanel
            bookId={bookId}
            bookLanguage={audiobook.bookLanguage}
            bookOriginalLanguage={audiobook.bookOriginalLanguage}
            chapters={chapters}
            selectedChapterId={selectedChapterId}
            activeVersion={activeVersion}
            activeLanguage={activeLanguage}
            totalBookWordCount={totalBookWordCount}
            billingLoading={billing.loading}
            billingIsProActive={billing.isProActive}
            audiobookFeatureEnabled={audiobook.audiobookFeatureEnabled}
            isAudiobookActive={audiobook.isAudiobookActive}
            audiobookStatusUi={audiobook.audiobookStatusUi}
            audiobookError={audiobook.audiobookError}
            effectiveAudiobookProgress={audiobook.effectiveAudiobookProgress}
            effectiveAudiobookError={audiobook.effectiveAudiobookError}
            audiobookEtaText={audiobook.audiobookEtaText}
            audiobookScope={audiobook.audiobookScope}
            setAudiobookScope={audiobook.setAudiobookScope}
            audiobookSelectedChapterIds={audiobook.audiobookSelectedChapterIds}
            setAudiobookSelectedChapterIds={audiobook.setAudiobookSelectedChapterIds}
            isAudiobookChapterPickerOpen={audiobook.isAudiobookChapterPickerOpen}
            setIsAudiobookChapterPickerOpen={audiobook.setIsAudiobookChapterPickerOpen}
            audiobookRequestedChapterIds={audiobook.audiobookRequestedChapterIds}
            audiobookControlPending={audiobook.audiobookControlPending}
            canPauseAudiobook={audiobook.canPauseAudiobook}
            canResumeAudiobook={audiobook.canResumeAudiobook}
            canCancelAudiobook={audiobook.canCancelAudiobook}
            handleAudiobookControl={audiobook.handleAudiobookControl}
            handleGenerateAudiobook={audiobook.handleGenerateAudiobook}
            audiobookSelectedLanguages={audiobook.audiobookSelectedLanguages}
            setAudiobookSelectedLanguages={audiobook.setAudiobookSelectedLanguages}
            audiobookCheckoutModalOpen={audiobook.audiobookCheckoutModalOpen}
            setAudiobookCheckoutModalOpen={audiobook.setAudiobookCheckoutModalOpen}
            audiobookCheckoutLoading={audiobook.audiobookCheckoutLoading}
            handleAudiobookCheckout={audiobook.handleAudiobookCheckout}
            shouldShowGeneratedAudiobookPlayer={audiobook.shouldShowGeneratedAudiobookPlayer}
            fallbackGeneratedAudiobookUrl={audiobook.fallbackGeneratedAudiobookUrl}
            latestAudiobookManifestUrl={audiobook.latestAudiobookManifestUrl}
          />
        )}

        {tool === "translate" && getTranslationsEnabled() && (
          <TranslatePanel
            bookId={bookId}
            bookTitle={bookTitle}
            authorDisplayName={authorDisplayName}
            bookLengthLabel={`${chapters.length} chapters`}
            sourceLanguage={translation.translationSourceLang}
            sourceVersionId={activeVersion?.id ?? null}
            isProLocked={!billing.isProActive}
            billingLoading={billing.loading}
            chapters={chapters.map((ch) => ({ id: ch.id, title: ch.title }))}
            selectedChapterId={selectedChapterId}
            onMessage={translation.setTranslateMessage}
            hideTitle
          />
        )}

        {tool === "publish" && (
          <div className="space-y-8">
            <PublishPanel
              bookId={bookId}
              bookTitle={bookTitle}
              bookDescription={bookDescription}
              authorDisplayName={authorDisplayName}
              coverImageUrl={cover.displayCoverUrl}
              chapters={chapters}
              selectedChapterId={selectedChapterId}
              bookVersions={bookVersions}
              isPublished={publishing.isPublished}
              publishVisibility={publishing.publishVisibility}
              publishedChapterCount={publishing.publishedChapterCount}
              missingPublishRequirements={publishing.missingPublishRequirements}
              publishDisabled={publishing.publishDisabled}
              chapterPublishDisabled={publishing.chapterPublishDisabled}
              selectedChapterAlreadyPublished={publishing.selectedChapterAlreadyPublished}
              visibilityChanged={publishing.visibilityChanged}
              isPublishing={publishing.isPublishing}
              publishError={publishing.publishError}
              confirmPublishAction={publishing.confirmPublishAction}
              confirmCopy={publishing.confirmCopy}
              onVisibilityChange={(v) => { publishing.setPublishVisibility(v); publishing.setPublishError(null); }}
              onPublishFull={() => publishing.setConfirmPublishAction("publish")}
              onPublishChapter={() => void publishing.handlePublishSelectedChapter()}
              onUpdateSettings={() => publishing.setConfirmPublishAction("update")}
              onUnpublish={() => publishing.setConfirmPublishAction("unpublish")}
              onConfirm={() => publishing.confirmPublishAction && void publishing.handlePublishAction(publishing.confirmPublishAction)}
              onCancelConfirm={() => publishing.setConfirmPublishAction(null)}
              onChapterPublishToggle={(chapter, shouldPublish) => void publishing.handleChapterPublishToggle(chapter, shouldPublish)}
              onSelectChapter={(id) => { onSetSelectedChapterId(id); onResetSessionWords(); }}
              onOpenCover={() => onNavigateToPanel("cover")}
              genreSelector={getRecommendationsEnabled() ? <GenreSelector bookId={bookId} /> : undefined}
            />
            <PricingPanel
              chapters={chapters}
              priceAmountMinor={pricing.priceAmountMinor}
              setPriceAmountMinor={pricing.setPriceAmountMinor}
              priceCurrency={pricing.priceCurrency}
              setPriceCurrency={pricing.setPriceCurrency}
              pricingModel={pricing.pricingModel}
              setPricingModel={pricing.setPricingModel}
              pricingSaving={pricing.pricingSaving}
              pricingDirty={pricing.pricingDirty}
              pricingError={pricing.pricingError}
              pricingSaved={pricing.pricingSaved}
              handleSavePricing={pricing.handleSavePricing}
              isPublished={publishing.isPublished}
              stripeConfigured={stripeConfigured}
              currentVisibility={publishing.currentVisibility}
            />
            <PrintPanel
              bookId={bookId}
              title={bookTitle}
              authorDisplayName={authorDisplayName}
              coverImageUrl={cover.displayCoverUrl}
              originalUrl={bookOriginalUrl}
              chapterCount={chapters.length}
              totalWordCount={totalBookWordCount}
              languageCode={activeLanguage}
              isPublished={publishing.isPublished}
              priceAmountMinor={pricing.priceAmountMinor}
              priceCurrency={pricing.priceCurrency}
              printOnDemandSettings={printOnDemandSettings}
              onOpenEdit={() => onNavigateToPanel("edit")}
              onOpenCover={() => onNavigateToPanel("cover")}
              onOpenPublish={() => onNavigateToPanel("publish")}
              onSavePrintOnDemandSettings={onSavePrintOnDemandSettings}
            />

            {/* Danger zone */}
            <div className="rounded-2xl border border-red-200/60 bg-red-50/30 px-6 py-5 dark:border-red-900/30 dark:bg-red-950/10">
              <h3 className="text-[14px] font-semibold text-red-800 dark:text-red-300">Danger zone</h3>
              <p className="mt-1.5 text-[13px] text-red-700/80 dark:text-red-400/70">
                Permanently delete this book and all its chapters, translations, and audiobooks.
              </p>
              <div className="mt-4">
                <DeleteBookButton
                  bookId={bookId}
                  bookTitle={bookTitle}
                  redirectTo="/author/books"
                  label="Delete this book"
                  className="rounded-lg border border-red-300 bg-white px-4 py-2 text-[13px] font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
                />
              </div>
            </div>
          </div>
        )}

        {tool === "review" && (
          <ReviewPanel
            bookId={bookId}
            bookTitle={bookTitle}
            chapters={chapters}
            bookVersions={bookVersions}
            activeVersion={activeVersion}
            coverImageUrl={cover.displayCoverUrl}
            audiobookStatus={bookAudiobookStatus}
            isPublished={publishing.isPublished}
            printOnDemandSettings={printOnDemandSettings}
            pricingModel={pricing.pricingModel}
            priceAmountMinor={pricing.priceAmountMinor}
            priceCurrency={pricing.priceCurrency}
            marketingCampaigns={marketingCampaigns}
            onNavigate={onNavigateToPanel}
            onPublish={() => publishing.setConfirmPublishAction("publish")}
          />
        )}

        {/* Backward compat: direct URL panels not in the main flow */}
        {tool === "pricing" && (
          <PricingPanel
            chapters={chapters}
            priceAmountMinor={pricing.priceAmountMinor}
            setPriceAmountMinor={pricing.setPriceAmountMinor}
            priceCurrency={pricing.priceCurrency}
            setPriceCurrency={pricing.setPriceCurrency}
            pricingModel={pricing.pricingModel}
            setPricingModel={pricing.setPricingModel}
            pricingSaving={pricing.pricingSaving}
            pricingDirty={pricing.pricingDirty}
            pricingError={pricing.pricingError}
            pricingSaved={pricing.pricingSaved}
            handleSavePricing={pricing.handleSavePricing}
            isPublished={publishing.isPublished}
            stripeConfigured={stripeConfigured}
            currentVisibility={publishing.currentVisibility}
          />
        )}
        {tool === "print" && (
          <PrintPanel
            bookId={bookId}
            title={bookTitle}
            authorDisplayName={authorDisplayName}
            coverImageUrl={cover.displayCoverUrl}
            originalUrl={bookOriginalUrl}
            chapterCount={chapters.length}
            totalWordCount={totalBookWordCount}
            languageCode={activeLanguage}
            isPublished={publishing.isPublished}
            priceAmountMinor={pricing.priceAmountMinor}
            priceCurrency={pricing.priceCurrency}
            printOnDemandSettings={printOnDemandSettings}
            onOpenEdit={() => onNavigateToPanel("edit")}
            onOpenCover={() => onNavigateToPanel("cover")}
            onOpenPublish={() => onNavigateToPanel("publish")}
            onSavePrintOnDemandSettings={onSavePrintOnDemandSettings}
          />
        )}
        {tool === "market" && getMarketingEnabled() && (
          <MarketPanel
            bookId={bookId}
            isPublished={publishing.isPublished}
            marketingCampaigns={marketingCampaigns}
            isProLocked={audiobook.isProFeatureLocked}
            proLockMessage={audiobook.proFeatureLockMessage}
            billingLoading={billing.loading}
            onGenerateCopy={async (channel, lang) => {
              if (marketing.isGeneratingMarketing) return;
              marketing.setMarketingChannel(channel);
              marketing.setMarketingLanguage(lang as SupportedLanguage);
              await marketing.handleGenerateMarketingCopy();
            }}
            isGenerating={marketing.isGeneratingMarketing}
            trailerStatus={bookTrailerStatus}
            trailerUrl={bookTrailerUrl}
            coverImage={cover.displayCoverUrl}
            bookTitle={bookTitle}
            bookDescription=""
          />
        )}
        {tool === "trailer" && (
          <TrailerPanel
            bookId={bookId}
            bookTitle={bookTitle}
            bookDescription={bookDescription}
            coverImage={cover.displayCoverUrl}
            isPublished={publishing.isPublished}
            trailerStatus={bookTrailerStatus ?? null}
            trailerUrl={bookTrailerUrl ?? null}
            isProLocked={!billing.isProActive}
            billingLoading={billing.loading}
          />
        )}
        {tool === "statistics" && (
          <StatisticsPanel
            bookId={bookId}
            isPublished={publishing.isPublished}
          />
        )}
        {tool === "import" && (
          <ImportManusSection
            bookId={bookId}
            bookVersionId={activeVersion?.id ?? null}
            refetchJobs={refetchBookJob}
            importJobs={importJobs}
          />
        )}

      </div>
    </div>
  );
}
