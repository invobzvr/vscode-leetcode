// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { commands, ViewColumn } from "vscode";
import { getLeetCodeEndpoint } from "../commands/plugin";
import { Endpoint, IProblem } from "../shared";
import { ILeetCodeWebviewOption, LeetCodeWebview } from "./LeetCodeWebview";
import { markdownEngine } from "./markdownEngine";

class LeetCodePreviewProvider extends LeetCodeWebview {

    protected readonly viewType: string = "leetcode.preview";
    private node: IProblem;
    private description: IDescription;
    private sideMode: boolean = false;

    public isSideMode(): boolean {
        return this.sideMode;
    }

    public show(descString: string, node: IProblem, isSideMode: boolean = false): void {
        this.description = this.parseDescription(descString, node);
        this.node = node;
        this.sideMode = isSideMode;
        this.showWebviewInternal();
        // Comment out this operation since it sometimes may cause the webview become empty.
        // Waiting for the progress of the VS Code side issue: https://github.com/microsoft/vscode/issues/3742
        // if (this.sideMode) {
        //     this.hideSideBar(); // For better view area
        // }
    }

    protected getWebviewOption(): ILeetCodeWebviewOption {
        return {
            title: `${this.node.id}.${this.node.name}: Description`,
            viewColumn: this.sideMode ? ViewColumn.Two : ViewColumn.One,
            preserveFocus: true,
        };
    }

    protected getWebviewContent(): string {
        const button: { element: string, script: string, style: string } = {
            element: `<button id="solve">Code Now</button>`,
            script: `const button = document.getElementById('solve');
                    button.onclick = () => vscode.postMessage({
                        command: 'ShowProblem',
                    });`,
            style: `<style>
                #solve {
                    position: fixed;
                    bottom: 1rem;
                    right: 1rem;
                    margin: 1rem 0;
                    padding: 0.2rem 1rem;
                }
                </style>`,
        };
        const { title, url, category, difficulty, likes, dislikes, body } = this.description;
        const head: string = markdownEngine.render(`# [${title}](${url})`);
        const info: string = markdownEngine.render([
            `| Category | Difficulty | Likes | Dislikes |`,
            `| :------: | :--------: | :---: | :------: |`,
            `| ${category} | ${difficulty} | ${likes} | ${dislikes} |`,
        ].join("\n"));
        const tags: string = [
            `<details>`,
            `<summary><strong>Tags</strong></summary>`,
            markdownEngine.render(
                this.description.tags
                    .map((t: string) => `[\`${t}\`](https://leetcode.com/tag/${t})`)
                    .join(" | "),
            ),
            `</details>`,
        ].join("\n");
        const companies: string = [
            `<details>`,
            `<summary><strong>Companies</strong></summary>`,
            markdownEngine.render(
                this.description.companies
                    .map((c: string) => `\`${c}\``)
                    .join(" | "),
            ),
            `</details>`,
        ].join("\n");
        const links: string = markdownEngine.render(`[Discussion](${this.getDiscussionLink(url)}) | [Solution](${this.getSolutionLink(url)})`);
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; script-src vscode-resource: 'unsafe-inline'; style-src vscode-resource: 'unsafe-inline';"/>
                ${markdownEngine.getStyles()}
                ${button.style}
                <style>
                    code { white-space: pre-wrap; }
                    button {
                        border: 0;
                        color: white;
                        background-color: var(--vscode-button-background);
                    }
                    button:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    button:active {
                        border: 0;
                    }
                    .test-case {
                        float: right;
                        padding: 3px 7px;
                    }
                </style>
            </head>
            <body>
                ${head}
                ${info}
                ${tags}
                ${companies}
                ${body}
                <hr />
                ${links}
                ${button.element}
                <script>
                    const vscode = acquireVsCodeApi();
                    ${button.script}
                    [...document.querySelectorAll('.test-case')].forEach(ii => ii.addEventListener('click', evt => {
                        const el = evt.target.nextElementSibling;
                        const [input, output, ...txt] = el.innerText.replace(/(输入|输出|：|: )/g, '').split('\\n');
                        vscode.postMessage({
                            command: 'TestCase',
                            value: { input, output },
                        });
                    }));
                </script>
            </body>
            </html>
        `;
    }

    protected onDidDisposeWebview(): void {
        super.onDidDisposeWebview();
        this.sideMode = false;
    }

    protected async onDidReceiveMessage(message: IWebViewMessage): Promise<void> {
        switch (message.command) {
            case "ShowProblem": {
                await commands.executeCommand("leetcode.showProblem", this.node);
                break;
            }
            case "TestCase": {
                await commands.executeCommand("leetcode.testCase", this.node.id, message.value);
                break;
            }
        }
    }

    // private async hideSideBar(): Promise<void> {
    //     await commands.executeCommand("workbench.action.focusSideBar");
    //     await commands.executeCommand("workbench.action.toggleSidebarVisibility");
    // }

    private parseDescription(descString: string, problem: IProblem): IDescription {
        const [
            /* title */, ,
            url, ,
            /* tags */, ,
            /* langs */, ,
            category,
            difficulty,
            likes,
            dislikes,
            /* accepted */,
            /* submissions */,
            /* testcase */, ,
            ...body
        ] = descString.split("\n");
        return {
            title: problem.name,
            url,
            tags: problem.tags,
            companies: problem.companies,
            category: category.slice(2),
            difficulty: difficulty.slice(2),
            likes: likes.split(": ")[1].trim(),
            dislikes: dislikes.split(": ")[1].trim(),
            body: body.join("\n").replace(/<pre>[\r\n]*([^]+?)[\r\n]*<\/pre>/g, '<pre><button class="test-case">Test Case</button><code>$1</code></pre>'),
        };
    }

    private getDiscussionLink(url: string): string {
        const endPoint: string = getLeetCodeEndpoint();
        if (endPoint === Endpoint.LeetCodeCN) {
            return url.replace("/description/", "/comments/");
        } else if (endPoint === Endpoint.LeetCode) {
            return url.replace("/description/", "/discuss/?currentPage=1&orderBy=most_votes&query=");
        }

        return "https://leetcode.com";
    }

    private getSolutionLink(url: string): string {
        return url.replace("/description/", "/solution/");
    }
}

interface IDescription {
    title: string;
    url: string;
    tags: string[];
    companies: string[];
    category: string;
    difficulty: string;
    likes: string;
    dislikes: string;
    body: string;
}

interface IWebViewMessage {
    command: string;
    value: object | null;
}

export const leetCodePreviewProvider: LeetCodePreviewProvider = new LeetCodePreviewProvider();
