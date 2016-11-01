import CodeMirror from "codemirror";
import JavascriptMode from "codemirror/mode/javascript/javascript";

import AS3JS from "../../../../as3js";
import {js_beautify} from "js-beautify";

//import browserify from "browserify";
//import BrowserFS from "browserfs";

const originalConsole = Object.assign({}, console);

const consoleNode = document.getElementById("console");
const CONSOLE_EVENT = "console";

function console_generic(method) {
  consoleNode.dispatchEvent(new CustomEvent(CONSOLE_EVENT, { detail: arguments }));
  originalConsole[method].apply(this, Array.prototype.slice.call(arguments, 1));
}
for (const method of ["log", "warn", "error", "info", "debug"]) {
  console[method] = console_generic.bind(console, method);
}


console.addEventListener = consoleNode.addEventListener.bind(consoleNode);
console.removeEventListener = consoleNode.removeEventListener.bind(consoleNode);

class Main {
  // Grab DOM this.elements
  elements = {
    evalInput: "eval",
    entryInput: "entry",
    inputTextArea: "input",
    outputTextArea: "output",
    examplesDropdown: "examples",

    targetDropdown: "target",
  };
  timeout = null;
  inputCode = null;
  outputCode = null;
  packageDividers = { };
  compiledResult = null;
  modules = null;

  constructor() {
    for (const key in this.elements) {
      this.elements[key] = document.getElementById(this.elements[key]);
    }

    // Set up CodeMirror
    this.inputCode = CodeMirror.fromTextArea(this.elements.inputTextArea, {
      theme: "monokai",
      lineNumbers: true,
      mode: "javascript"
    });
    this.outputCode = CodeMirror.fromTextArea(this.elements.outputTextArea, {
    //	  theme: "monokai",
      lineNumbers: true,
      mode: "javascript"
    });

    this.elements.entryInput.addEventListener("keydown", this.refresh.bind(this));
    this.inputCode.on("change", (instance, evt) => this.refresh());
    this.elements.examplesDropdown.addEventListener("change", evt => this.updateExample(evt.currentTarget.value));
    this.elements.targetDropdown.addEventListener("change", evt => this.processText());

    console.addEventListener(CONSOLE_EVENT, this.handleConsole);

    // Process the initial text
    this.updateExample();
    this.processText();
  }

  static simpleFormat() {
    let result = "";

    for (let i = 1; i < arguments.length; ++i) {
      const value = arguments[i];
      if (typeof value === "object") {
        result += JSON.stringify(value);
      } else {
        result += value;        
      }
    }

    return result;
  }

  handleConsole = (evt) => {
    const div = Object.assign(document.createElement("div"), {
      className: evt.detail[0],
      innerText: Main.simpleFormat.apply(null, evt.detail)
    });
    consoleNode.appendChild(div);
    div.scrollIntoView();
  }
  // Function to compile input text
  processText() {
    this.inputCode.save();
    clearTimeout(this.timeout);

    let success = false;
    let outputText = "";
    const as3js = new AS3JS();
    let inputText = this.elements.inputTextArea.value;
    let rawPackages = inputText.split(/\/\*\s+AS3JS\s+File\s+\*\//);
    for (var i = 0; i < rawPackages.length; i++) {
      if (rawPackages[i].match(/^\s*$/g)) {
        rawPackages.splice(i--, 1);
      }
    }

    const willExecuteCode = this.elements.evalInput.checked;
    const entry = this.elements.entryInput.value.replace(/\s*/g, "");
    const targetSupports = {
      es5: {
        importJS: false,
      },
      es2015: {
          ImportJS: false,
          class: true,
          let: true,
          const: true,
          accessors: true,
//          import: true,
      },
      es_next: {
          ImportJS: false,
          class: true,
          let: true,
          const: true,
          accessors: true,
          import: true,
          static: true,
          memberVariables: true,
      },
      typescript: {
          ImportJS: false,
          class: true,
          let: true,
          const: true,
          accessors: true,
          import: true,
          static: true,
          memberVariables: true,
          flowTypes: true,
      },
    };
    this.modules = {};
    try {
    	const result = as3js.compile({
        rawPackages: rawPackages,
        silent: true,
        verbose: false,
        safeRequire: false,
        entry,
        entryMode: "instance",
        supports: targetSupports[this.elements.targetDropdown.value]
      });
      this.compiledResult = result;

      for (const packageName in this.packageDividers) {
        const divider = this.packageDividers[packageName];
        this.outputCode.removeLineWidget(divider.lineWidget);
      }
      this.packageDividers = [];

      let lineNumber = 0;
      for (const packageName in result.packageSources) {
      	const packageSource = js_beautify(result.packageSources[packageName], {
            indent_size: 2,
            max_preserve_newlines: 2
        });
        if (outputText.length) {
          outputText += "\n";
        }
      	outputText += packageSource;
        this.packageDividers[packageName.replace(/\./g, "/")] = {
          lineNumber,
          lineHandle: null,
          lineWidget: null,
        };
        lineNumber += packageSource.split("\n").length;
      }
      success = true;
    } catch(e) {
      outputText = e.toString();
    }
    this.elements.outputTextArea.value = outputText;
    this.outputCode.setValue(this.elements.outputTextArea.value);

    const doc = this.outputCode.getDoc();
    for (const packageName in this.packageDividers) {
        const div = document.createElement("div");
        const prefix = document.createElement("span");
        
        prefix.className = "CodeMirror-section-header-prefix";
        prefix.appendChild(document.createTextNode("./"));
        div.appendChild(prefix);

        div.appendChild(document.createTextNode(packageName));
        div.className = "CodeMirror-section-header";

        const divider = this.packageDividers[packageName];
        divider.lineHandle = doc.getLineHandle(divider.lineNumber);
        delete divider.lineNumber;
        divider.lineWidget = this.outputCode.addLineWidget(divider.lineHandle, div, {above: true, coverGutter: true, noHScroll: true});
    }

    if (success && willExecuteCode) {
      // Need to execute in context of window
      try {
        const EntryPointClass = this.require({path:""}, entry);
        new EntryPointClass();
/* 
        browserify({
            entries: ENTRY_FILE,
//            debug: true
        })
            .transform("babelify", {
                presets: [
                    "es2015",
                ],
                plugins: [
                    "transform-class-properties",
                    "transform-flow-strip-types"
                ]
            })
            .bundle().on('error', function(error){
                gutil.log(gutil.colors.red('[Build Error]', error.message));
                this.emit('end');
            })
            .pipe(files("main.js"))
            .pipe(buffer())
            .pipe(gulp.dest(path.resolve(paths().compiled.jssrc)))
*/
//        eval.call(null, outputText);
      } catch(e) {
        console.error(e);
      }
    }
  }

  static resolve(root, relative) {
    relative = relative.replace(/\.js$/, "");

    if (false === /^\./.test(relative)) {
      return relative;
    }
    
    const parts = (root.length ?root.split("/") :[]).concat(relative.split("/"));

    for (var i = 0; i < parts.length;) {
      const part = parts[i];
      if (/^(\.+)$/.test(part)) {
        i += part.length - 1;
        parts.splice(i, part.length);
      } else {
        ++i;
      }
    }
    return parts.join("/");
  }

  static pathOf(id) {
    return id.split("/").slice(0, -1).join("/");
  }

  require(requiredBy, id) {
    const fullId = Main.resolve(requiredBy.path, id).replace(/\//g, ".");
    let module = this.modules[fullId];

    if (!module) {
      const packageSource = this.compiledResult.packageSources[fullId];
      if (!packageSource) {
        console.error(`Module ${fullId} not found (${id} imported by ${requiredBy.id})!`); // todo
      }

      module = {
        id: fullId,
        exports: {},
        path: Main.pathOf(id)
      };
      const moduleFactory = new Function("module", "require", packageSource);
      moduleFactory(module, this.require.bind(this, module));

      this.modules[fullId] = module;
    }

    return module.exports;
  }

  // Show example dropdowns
  updateExample() {
    const sourceCode = document.getElementById(this.elements.examplesDropdown.value);
    const entry = sourceCode.getAttribute("data-entry");
    this.elements.entryInput.value = entry;
    this.inputCode.setValue(sourceCode.text);
  };

  // Set up events
  refresh() {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    this.timeout = setTimeout(this.processText.bind(this), 500);
  }
}

new Main();