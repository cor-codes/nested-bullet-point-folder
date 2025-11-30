import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { foldable, foldEffect } from '@codemirror/language';
import { EditorView } from '@codemirror/view';

interface PluginSettings {
	indentationFoldLevel: number,
	recursiveFold: boolean,
	showMethod: {
		type: 'none' | 'any' | 'tagged',
		tags: string[]
	}
}

const DEFAULT_SETTINGS: PluginSettings = {
	indentationFoldLevel: 8,
	recursiveFold: true,
	showMethod: {
		type: 'none',
		tags: []
	}
}

const getCM = (editor: Editor) => (editor as any).cm as EditorView;

const countIntendation = (content: string) => {
	content = content.replace(/\t/g, '    ');

	const diff = content.length - content.trimStart().length;
	return diff;
}

const hasTags = (app: App, file: TFile, ...tagQuery: string[]) => {
	const mdCache = app.metadataCache.getFileCache(file);
	if (mdCache == null) return;

	const tags: string[] = [];
	if (mdCache.frontmatter != null && mdCache.frontmatter.tags != null) {
		const fmTags = mdCache.frontmatter.tags;
		if (Array.isArray(fmTags)) {
			tags.push(...fmTags.map(t => t.toLowerCase()));
		} else if (typeof fmTags == 'string') {
			tags.push(fmTags.toLowerCase());
		}
	}

	if (mdCache.tags) {
		tags.push(...mdCache.tags.map(t => t.tag.toLowerCase()));
	}

	return tagQuery.some(tag => 
		tags.includes(tag.toLowerCase()) ||
		tags.includes(`#${tag.toLowerCase()}`)
	);
}

export default class NestedIndentFoldPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new SettingsTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('file-open', file => {
				if (file == null) { return; }

				const { showMethod } = this.settings;
				const canDeepIndent = 
					showMethod.type == 'none' ? false :
					showMethod.type == 'any' ? true :
					hasTags(this.app, file, ...showMethod.tags);

				if (!canDeepIndent) { return; }

				setTimeout(() => this.foldDeepListItems(), 50);
			})
		);
	}


	greatestIndent() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view == null) return 0;

		const { editor } = view;
		const lineCount = editor.lineCount();
		let greatestIndent = 0;
		
		for (let lineInd = 1; lineInd < lineCount + 1; lineInd++) {
			const content = editor.getLine(lineInd);

			const indent = countIntendation(content);
			if (indent > greatestIndent) {
				greatestIndent = indent;
			}
		}

		return greatestIndent;
	}

	findLine(seen: Set<number>, depth: number) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view == null) return;

		const { editor } = view;
		const lineCount = editor.lineCount();
		
		for (let lineInd = 1; lineInd < lineCount + 1; lineInd++) {
			const content = editor.getLine(lineInd);

			const indent = countIntendation(content);
			if (indent < depth) continue;
			if (!content.trim().startsWith('-')) continue;
			if (seen.has(lineInd)) continue;

			seen.add(lineInd);
			return lineInd;
		}

		return null;
	}

	foldDeepListItems() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view == null) return;

		if (!this.settings.recursiveFold) {
			this.foldDeepListItemsAtDepth(this.settings.indentationFoldLevel);
			return;
		}

		const endDepth = this.settings.indentationFoldLevel;
		const startDepth = Math.floor(this.greatestIndent() / 4) * 4;
		
		for (let depth = startDepth; depth >= endDepth; depth -= 4) {
			this.foldDeepListItemsAtDepth(depth);
		}
	}

	foldDeepListItemsAtDepth(depth: number) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view == null) return;

		const { editor } = view;
		const cm = getCM(editor);

		const seen = new Set<number>();

		while (true) {
			const lineInd = this.findLine(seen, depth);
			if (lineInd == null) { break; }

			const line = cm.lineBlockAt(cm.state.doc.line(lineInd).from);
			const range = foldable(cm.state, line.from, line.to)!!;

			if (range == null) { continue; }
			if (range.from == range.to) { continue; }

			cm.dispatch({
				effects: [ 
					foldEffect.of(range)
				]
			}); 
		}
	}

	fullyUnfold() {}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SettingsTab extends PluginSettingTab {
	plugin: NestedIndentFoldPlugin;

	constructor(app: App, plugin: NestedIndentFoldPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();
		containerEl.createEl('h2', { text: 'Behavior' });

		new Setting(containerEl)
			.setName('Indentation Fold Level')
			.setDesc('At what indent level to automatically fold bullet points')
			.addSlider(slider => slider
				.setValue(this.plugin.settings.indentationFoldLevel)
				.setLimits(0, 20, 4)
				.onChange(async value => {
					this.plugin.settings.indentationFoldLevel = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Recursive Fold')
			.setDesc('Whether or not to recursively fold bullet points after the indentation fold level.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.recursiveFold)
				.onChange(async value => {
					this.plugin.settings.recursiveFold = value;
					await this.plugin.saveSettings();
				})
			);

		let tagsInputEl: HTMLElement | undefined = undefined;

		new Setting(containerEl)
			.setName('Show Method')
			.setDesc('What documents should be automatically indent-folded.')
			.addDropdown(toggle => toggle
				.addOption('none', 'None')
				.addOption('any', 'Any')
				.addOption('tagged', 'Tagged')
				.setValue(this.plugin.settings.showMethod.type)
				.onChange(async value => {
					if (tagsInputEl != null) {
						tagsInputEl.toggleClass('hidden', value !== 'tagged');
					}

					this.plugin.settings.showMethod.type = value as 'none' | 'any' | 'tagged';
					await this.plugin.saveSettings();
				})
			)
			.addText(text => {
				text
					.setPlaceholder('comma-separated tags')
					.setValue(
						this.plugin.settings.showMethod.tags.join(', ')
					)
					.onChange(async tags => {
						this.plugin.settings.showMethod.tags = tags.split(',')
							.map(tag => tag.trim())
							.filter(tag => tag.length > 0);
						await this.plugin.saveSettings();
					});

				tagsInputEl = text.inputEl;
				if (this.plugin.settings.showMethod.type == 'any') {
					tagsInputEl.addClass('hidden');
				}
			});
	}
}
