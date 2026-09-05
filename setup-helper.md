# Doorstop VS Code extension

## Setup

### How to setup development environment

Make sure you have Node.js and Git installed.

Install Yeoman

```bash
npx --package yo --package generator-code -- yo code
```

```text
# ? What type of extension do you want to create? New Extension (TypeScript)
# ? What's the name of your extension? doorstop

# ? What's the identifier of your extension? helloworld
# ? What's the description of your extension? LEAVE BLANK
# ? Initialize a git repository? Y
# ? Which bundler to use? esbuild
# ? Which package manager to use? npm

# ? Do you want to open the new folder with Visual Studio Code? Open with `code`
```

> install the recommended vs code extension 'connor4312.esbuild-problem-matchers'

### Start implementation

``` bash
npm install js-yaml
npm install --save-dev @types/js-yaml
```

### Deploay

install package generator
```bash
npm install -g @vscode/vsce
```

build the package
```bash
vsce package
```

install the package
```bash
code --install-extension doorstop-0.0.1.vsix
```


```bash
# Log in using your Azure DevOps Personal Access Token
vsce login your-publisher-name
# Publish to Marketplace
vsce publish
```

```Bash
vsce publish patch # 0.0.1 -> 0.0.2
vsce publish minor # 0.0.1 -> 0.1.0
vsce publish major # 0.0.1 -> 1.0.0
```