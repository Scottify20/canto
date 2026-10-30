import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  LucideArrowUp, LucideArrowUpDown, LucideBrushCleaning, LucideCheck, LucideChevronDown, LucideChevronLeft,
  LucideChevronRight, LucideChevronUp, LucideCircleCheck, LucideCircleQuestionMark, LucideCircleX, LucideColumns3,
  LucideCopy, LucideDisc3, LucideDownload, LucideDynamicIcon, LucideEllipsis, LucideExternalLink, LucideEye,
  LucideFileMusic, LucideFileText, LucideFolder, LucideFolderOpen, LucideFolderTree, LucideGauge, LucideGripVertical,
  LucideHeadphones, LucideImage, LucideInbox, LucideInfo, LucideKeyRound, LucideLayers, LucideLibrary, LucideLink,
  LucideListFilter, LucideMaximize2, LucideMenu, LucideMicVocal, LucideMinimize2, LucideMoon, LucidePencil, LucidePlus,
  LucideRefreshCw, LucideSave, LucideScanSearch, LucideSearch, LucideSettings, LucideShieldCheck, LucideSparkles,
  LucideSun, LucideTrash, LucideTriangleAlert, LucideUndo2, LucideUpload, LucideWandSparkles, LucideWrench, LucideX,
} from '@lucide/angular';

const ICONS = {
  'arrow-up': LucideArrowUp, 'sort': LucideArrowUpDown, 'clean': LucideBrushCleaning, 'check': LucideCheck,
  'down': LucideChevronDown, 'left': LucideChevronLeft, 'right': LucideChevronRight, 'up': LucideChevronUp,
  'ok': LucideCircleCheck, 'help': LucideCircleQuestionMark, 'no': LucideCircleX, 'columns': LucideColumns3,
  'copy': LucideCopy, 'disc': LucideDisc3, 'download': LucideDownload, 'more': LucideEllipsis,
  'external': LucideExternalLink, 'eye': LucideEye, 'file-music': LucideFileMusic, 'file-text': LucideFileText,
  'folder': LucideFolder, 'folder-open': LucideFolderOpen, 'structure': LucideFolderTree, 'gauge': LucideGauge,
  'grip': LucideGripVertical, 'headphones': LucideHeadphones, 'image': LucideImage, 'inbox': LucideInbox,
  'info': LucideInfo, 'key': LucideKeyRound, 'layers': LucideLayers, 'library': LucideLibrary, 'link': LucideLink,
  'filter': LucideListFilter, 'maximize': LucideMaximize2, 'menu': LucideMenu, 'mic': LucideMicVocal,
  'minimize': LucideMinimize2, 'moon': LucideMoon, 'edit': LucidePencil, 'plus': LucidePlus, 'refresh': LucideRefreshCw,
  'save': LucideSave, 'scan': LucideScanSearch, 'search': LucideSearch, 'settings': LucideSettings,
  'shield': LucideShieldCheck, 'sparkles': LucideSparkles, 'sun': LucideSun, 'trash': LucideTrash,
  'warn': LucideTriangleAlert, 'undo': LucideUndo2, 'upload': LucideUpload, 'wand': LucideWandSparkles,
  'wrench': LucideWrench, 'x': LucideX,
};

export type IconName = keyof typeof ICONS;

@Component({
  selector: 'app-icon',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0 items-center justify-center' },
  template: `<svg [lucideIcon]="data()" [size]="size()" [strokeWidth]="1.9"></svg>`,
})
export class Icon {
  name = input.required<IconName>();
  size = input(16);
  data = computed(() => ICONS[this.name()].icon);
}
