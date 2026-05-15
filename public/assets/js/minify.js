function isLetter(char) {
  return /^[A-Za-z]$/.test(char);
}

function isWhitespace(char) {
  return /\s/.test(char);
}

function tokenize(latex) {
  let tokens = [];
  let i = 0;

  while (i < latex.length) {
    let char = latex[i];

    if (isWhitespace(char)) {
      i += 1;
      continue;
    }

    if (char === '\\') {
      if (i + 1 >= latex.length) {
        tokens.push({
          type: "Char",
          value: char
        });
        i += 1;
        continue;
      }

      let next = latex[i + 1];
      if (isLetter(next)) {
        let j = i + 2;
        while (j < latex.length && isLetter(latex[j])) {
          j += 1;
        }

        tokens.push({
          type: "CWord",
          value: latex.slice(i + 1, j)
        });
        i = j;
        while (i < latex.length && isWhitespace(latex[i])) {
          i += 1;
        }
        continue;
      }

      tokens.push({
        type: "CSym",
        value: next
      });
      i += 2;
      continue;
    }

    if (char === '{') {
      tokens.push({
        type: "BeginGroup"
      });
      i += 1;
      continue;
    }

    if (char === '}') {
      tokens.push({
        type: "EndGroup"
      });
      i += 1;
      continue;
    }

    tokens.push({
      type: "Char",
      value: char
    });
    i += 1;
  }

  return tokens;
}

function parse(tokens) {
  let index = 0;

  function parseSeq(stopAtEndGroup) {
    let children = [];

    while (index < tokens.length) {
      let token = tokens[index];

      if (token.type === "EndGroup") {
        if (!stopAtEndGroup) {
          throw new Error("Unmatched end group");
        }

        index += 1;
        return children;
      }

      if (token.type === "BeginGroup") {
        index += 1;
        children.push({
          type: "Group",
          children: parseSeq(true)
        });
        continue;
      }

      index += 1;
      children.push(token);
    }

    if (stopAtEndGroup) {
      throw new Error("Unclosed group");
    }

    return {
      type: "Seq",
      children: children
    };
  }

  return parseSeq(false);
}

function isSingleTokenNode(node) {
  if (!node) {
    return false;
  }

  if (node.type === "Char" || node.type === "CWord" || node.type === "CSym") {
    return true;
  }

  if (node.type === "Group" && node.children.length === 1) {
    return isSingleTokenNode(node.children[0]);
  }

  return false;
}

function unwrapSingleTokenNode(node) {
  let current = node;

  while (current && current.type === "Group" && current.children.length === 1) {
    current = current.children[0];
  }

  return current;
}

function Minifier() {
  this.buffer = [];
  this.lastToken = null;
  this.braceProtectedCommands = new Set(["begin", "end"]);
}

Minifier.prototype.needsSeparator = function(node) {
  return this.lastToken &&
    this.lastToken.type === "CWord" &&
    node.type === "Char" &&
    isLetter(node.value);
};

Minifier.prototype.emitAtomic = function(node) {
  if (this.needsSeparator(node)) {
    this.buffer.push(" ");
  }

  if (node.type === "Char") {
    this.buffer.push(node.value);
  } else if (node.type === "CWord") {
    this.buffer.push("\\" + node.value);
  } else if (node.type === "CSym") {
    this.buffer.push("\\" + node.value);
  }

  this.lastToken = node;
};

Minifier.prototype.emitGroup = function(node) {
  let shouldKeepBraces = this.lastToken &&
    this.lastToken.type === "CWord" &&
    this.braceProtectedCommands.has(this.lastToken.value);

  if (!shouldKeepBraces && node.children.length === 1 && isSingleTokenNode(node.children[0])) {
    this.emitNode(unwrapSingleTokenNode(node.children[0]));
    return;
  }

  this.buffer.push("{");
  this.lastToken = null;
  node.children.forEach(child => this.emitNode(child));
  this.buffer.push("}");
  this.lastToken = null;
};

Minifier.prototype.emitNode = function(node) {
  if (node.type === "Seq") {
    node.children.forEach(child => this.emitNode(child));
    return;
  }

  if (node.type === "Group") {
    this.emitGroup(node);
    return;
  }

  this.emitAtomic(node);
};

function minify(latex) {
  try {
    let minifier = new Minifier();
    minifier.emitNode(parse(tokenize(latex)));
    return minifier.buffer.join("");
  } catch (error) {
    return latex;
  }
}
