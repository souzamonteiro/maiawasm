class Lexer {
  constructor(input) {
    this.input = input;
    this.position = 0;
    this.tokens = [];
    this.charClassDepth = 0;
    this.templateDepth = 0;
    this.templateBraceDepthStack = [];
    this.tokenPatterns = [    { type: 'TOKEN__28_', regex: /^\(/ },    { type: 'TOKEN_module', regex: /^module/ },    { type: 'TOKEN__29_', regex: /^\)/ },    { type: 'TOKEN_type', regex: /^type/ },    { type: 'TOKEN_rec', regex: /^rec/ },    { type: 'TOKEN_sub', regex: /^sub/ },    { type: 'TOKEN_final', regex: /^final/ },    { type: 'TOKEN_func', regex: /^func/ },    { type: 'TOKEN_struct', regex: /^struct/ },    { type: 'TOKEN_array', regex: /^array/ },    { type: 'TOKEN_field', regex: /^field/ },    { type: 'TOKEN_mut', regex: /^mut/ },    { type: 'TOKEN_i8', regex: /^i8/ },    { type: 'TOKEN_i16', regex: /^i16/ },    { type: 'TOKEN_tag', regex: /^tag/ },    { type: 'TOKEN_global', regex: /^global/ },    { type: 'TOKEN_memory', regex: /^memory/ },    { type: 'TOKEN_table', regex: /^table/ },    { type: 'TOKEN_local', regex: /^local/ },    { type: 'TOKEN_export', regex: /^export/ },    { type: 'TOKEN_import', regex: /^import/ },    { type: 'TOKEN_start', regex: /^start/ },    { type: 'TOKEN_data', regex: /^data/ },    { type: 'TOKEN_elem', regex: /^elem/ },    { type: 'TOKEN_declare', regex: /^declare/ },    { type: 'TOKEN_item', regex: /^item/ },    { type: 'TOKEN_offset', regex: /^offset/ },    { type: 'TOKEN_block', regex: /^block/ },    { type: 'TOKEN_loop', regex: /^loop/ },    { type: 'TOKEN_if', regex: /^if/ },    { type: 'TOKEN_then', regex: /^then/ },    { type: 'TOKEN_else', regex: /^else/ },    { type: 'TOKEN_try', regex: /^try/ },    { type: 'TOKEN_try_5F_table', regex: /^try_table/ },    { type: 'TOKEN_catch', regex: /^catch/ },    { type: 'TOKEN_catch_5F_ref', regex: /^catch_ref/ },    { type: 'TOKEN_catch_5F_all', regex: /^catch_all/ },    { type: 'TOKEN_catch_5F_all_5F_ref', regex: /^catch_all_ref/ },    { type: 'TOKEN_end', regex: /^end/ },    { type: 'TOKEN_nop', regex: /^nop/ },    { type: 'TOKEN_unreachable', regex: /^unreachable/ },    { type: 'TOKEN_drop', regex: /^drop/ },    { type: 'TOKEN_return', regex: /^return/ },    { type: 'TOKEN_throw_5F_ref', regex: /^throw_ref/ },    { type: 'TOKEN_select', regex: /^select/ },    { type: 'TOKEN_local_2E_get', regex: /^local\.get/ },    { type: 'TOKEN_local_2E_set', regex: /^local\.set/ },    { type: 'TOKEN_local_2E_tee', regex: /^local\.tee/ },    { type: 'TOKEN_global_2E_get', regex: /^global\.get/ },    { type: 'TOKEN_global_2E_set', regex: /^global\.set/ },    { type: 'TOKEN_table_2E_get', regex: /^table\.get/ },    { type: 'TOKEN_table_2E_set', regex: /^table\.set/ },    { type: 'TOKEN_table_2E_size', regex: /^table\.size/ },    { type: 'TOKEN_table_2E_grow', regex: /^table\.grow/ },    { type: 'TOKEN_table_2E_fill', regex: /^table\.fill/ },    { type: 'TOKEN_table_2E_copy', regex: /^table\.copy/ },    { type: 'TOKEN_table_2E_init', regex: /^table\.init/ },    { type: 'TOKEN_elem_2E_drop', regex: /^elem\.drop/ },    { type: 'TOKEN_memory_2E_size', regex: /^memory\.size/ },    { type: 'TOKEN_memory_2E_grow', regex: /^memory\.grow/ },    { type: 'TOKEN_memory_2E_fill', regex: /^memory\.fill/ },    { type: 'TOKEN_memory_2E_copy', regex: /^memory\.copy/ },    { type: 'TOKEN_memory_2E_init', regex: /^memory\.init/ },    { type: 'TOKEN_data_2E_drop', regex: /^data\.drop/ },    { type: 'TOKEN_ref_2E_null', regex: /^ref\.null/ },    { type: 'TOKEN_ref_2E_func', regex: /^ref\.func/ },    { type: 'TOKEN_ref_2E_is_5F_null', regex: /^ref\.is_null/ },    { type: 'TOKEN_ref_2E_as_5F_non_5F_null', regex: /^ref\.as_non_null/ },    { type: 'TOKEN_ref_2E_eq', regex: /^ref\.eq/ },    { type: 'TOKEN_ref_2E_test', regex: /^ref\.test/ },    { type: 'TOKEN_ref_2E_cast', regex: /^ref\.cast/ },    { type: 'TOKEN_struct_2E_new', regex: /^struct\.new/ },    { type: 'TOKEN_struct_2E_new_5F_default', regex: /^struct\.new_default/ },    { type: 'TOKEN_struct_2E_get', regex: /^struct\.get/ },    { type: 'TOKEN_struct_2E_get_5F_s', regex: /^struct\.get_s/ },    { type: 'TOKEN_struct_2E_get_5F_u', regex: /^struct\.get_u/ },    { type: 'TOKEN_struct_2E_set', regex: /^struct\.set/ },    { type: 'TOKEN_array_2E_new', regex: /^array\.new/ },    { type: 'TOKEN_array_2E_new_5F_default', regex: /^array\.new_default/ },    { type: 'TOKEN_array_2E_new_5F_fixed', regex: /^array\.new_fixed/ },    { type: 'TOKEN_array_2E_new_5F_data', regex: /^array\.new_data/ },    { type: 'TOKEN_array_2E_new_5F_elem', regex: /^array\.new_elem/ },    { type: 'TOKEN_array_2E_get', regex: /^array\.get/ },    { type: 'TOKEN_array_2E_get_5F_s', regex: /^array\.get_s/ },    { type: 'TOKEN_array_2E_get_5F_u', regex: /^array\.get_u/ },    { type: 'TOKEN_array_2E_set', regex: /^array\.set/ },    { type: 'TOKEN_array_2E_len', regex: /^array\.len/ },    { type: 'TOKEN_array_2E_fill', regex: /^array\.fill/ },    { type: 'TOKEN_array_2E_copy', regex: /^array\.copy/ },    { type: 'TOKEN_array_2E_init_5F_data', regex: /^array\.init_data/ },    { type: 'TOKEN_array_2E_init_5F_elem', regex: /^array\.init_elem/ },    { type: 'TOKEN_ref_2E_i31', regex: /^ref\.i31/ },    { type: 'TOKEN_i31_2E_get_5F_s', regex: /^i31\.get_s/ },    { type: 'TOKEN_i31_2E_get_5F_u', regex: /^i31\.get_u/ },    { type: 'TOKEN_any_2E_convert_5F_extern', regex: /^any\.convert_extern/ },    { type: 'TOKEN_extern_2E_convert_5F_any', regex: /^extern\.convert_any/ },    { type: 'TOKEN_call', regex: /^call/ },    { type: 'TOKEN_call_5F_ref', regex: /^call_ref/ },    { type: 'TOKEN_call_5F_indirect', regex: /^call_indirect/ },    { type: 'TOKEN_return_5F_call', regex: /^return_call/ },    { type: 'TOKEN_return_5F_call_5F_ref', regex: /^return_call_ref/ },    { type: 'TOKEN_return_5F_call_5F_indirect', regex: /^return_call_indirect/ },    { type: 'TOKEN_br', regex: /^br/ },    { type: 'TOKEN_br_5F_if', regex: /^br_if/ },    { type: 'TOKEN_br_5F_table', regex: /^br_table/ },    { type: 'TOKEN_br_5F_on_5F_null', regex: /^br_on_null/ },    { type: 'TOKEN_br_5F_on_5F_non_5F_null', regex: /^br_on_non_null/ },    { type: 'TOKEN_br_5F_on_5F_cast', regex: /^br_on_cast/ },    { type: 'TOKEN_br_5F_on_5F_cast_5F_fail', regex: /^br_on_cast_fail/ },    { type: 'TOKEN_throw', regex: /^throw/ },    { type: 'TOKEN_rethrow', regex: /^rethrow/ },    { type: 'TOKEN_f32_2E_const', regex: /^f32\.const/ },    { type: 'TOKEN_f64_2E_const', regex: /^f64\.const/ },    { type: 'TOKEN_i32_2E_load', regex: /^i32\.load/ },    { type: 'TOKEN_i64_2E_load', regex: /^i64\.load/ },    { type: 'TOKEN_f32_2E_load', regex: /^f32\.load/ },    { type: 'TOKEN_f64_2E_load', regex: /^f64\.load/ },    { type: 'TOKEN_i32_2E_load8_5F_s', regex: /^i32\.load8_s/ },    { type: 'TOKEN_i32_2E_load8_5F_u', regex: /^i32\.load8_u/ },    { type: 'TOKEN_i32_2E_load16_5F_s', regex: /^i32\.load16_s/ },    { type: 'TOKEN_i32_2E_load16_5F_u', regex: /^i32\.load16_u/ },    { type: 'TOKEN_i64_2E_load8_5F_s', regex: /^i64\.load8_s/ },    { type: 'TOKEN_i64_2E_load8_5F_u', regex: /^i64\.load8_u/ },    { type: 'TOKEN_i64_2E_load16_5F_s', regex: /^i64\.load16_s/ },    { type: 'TOKEN_i64_2E_load16_5F_u', regex: /^i64\.load16_u/ },    { type: 'TOKEN_i64_2E_load32_5F_s', regex: /^i64\.load32_s/ },    { type: 'TOKEN_i64_2E_load32_5F_u', regex: /^i64\.load32_u/ },    { type: 'TOKEN_i32_2E_store', regex: /^i32\.store/ },    { type: 'TOKEN_i64_2E_store', regex: /^i64\.store/ },    { type: 'TOKEN_f32_2E_store', regex: /^f32\.store/ },    { type: 'TOKEN_f64_2E_store', regex: /^f64\.store/ },    { type: 'TOKEN_i32_2E_store8', regex: /^i32\.store8/ },    { type: 'TOKEN_i32_2E_store16', regex: /^i32\.store16/ },    { type: 'TOKEN_i64_2E_store8', regex: /^i64\.store8/ },    { type: 'TOKEN_i64_2E_store16', regex: /^i64\.store16/ },    { type: 'TOKEN_i64_2E_store32', regex: /^i64\.store32/ },    { type: 'TOKEN_v128_2E_load', regex: /^v128\.load/ },    { type: 'TOKEN_v128_2E_store', regex: /^v128\.store/ },    { type: 'TOKEN_v128_2E_load8x8_5F_s', regex: /^v128\.load8x8_s/ },    { type: 'TOKEN_v128_2E_load8x8_5F_u', regex: /^v128\.load8x8_u/ },    { type: 'TOKEN_v128_2E_load16x4_5F_s', regex: /^v128\.load16x4_s/ },    { type: 'TOKEN_v128_2E_load16x4_5F_u', regex: /^v128\.load16x4_u/ },    { type: 'TOKEN_v128_2E_load32x2_5F_s', regex: /^v128\.load32x2_s/ },    { type: 'TOKEN_v128_2E_load32x2_5F_u', regex: /^v128\.load32x2_u/ },    { type: 'TOKEN_v128_2E_load8_5F_splat', regex: /^v128\.load8_splat/ },    { type: 'TOKEN_v128_2E_load16_5F_splat', regex: /^v128\.load16_splat/ },    { type: 'TOKEN_v128_2E_load32_5F_splat', regex: /^v128\.load32_splat/ },    { type: 'TOKEN_v128_2E_load64_5F_splat', regex: /^v128\.load64_splat/ },    { type: 'TOKEN_v128_2E_load32_5F_zero', regex: /^v128\.load32_zero/ },    { type: 'TOKEN_v128_2E_load64_5F_zero', regex: /^v128\.load64_zero/ },    { type: 'TOKEN_v128_2E_load8_5F_lane', regex: /^v128\.load8_lane/ },    { type: 'TOKEN_v128_2E_load16_5F_lane', regex: /^v128\.load16_lane/ },    { type: 'TOKEN_v128_2E_load32_5F_lane', regex: /^v128\.load32_lane/ },    { type: 'TOKEN_v128_2E_load64_5F_lane', regex: /^v128\.load64_lane/ },    { type: 'TOKEN_v128_2E_store8_5F_lane', regex: /^v128\.store8_lane/ },    { type: 'TOKEN_v128_2E_store16_5F_lane', regex: /^v128\.store16_lane/ },    { type: 'TOKEN_v128_2E_store32_5F_lane', regex: /^v128\.store32_lane/ },    { type: 'TOKEN_v128_2E_store64_5F_lane', regex: /^v128\.store64_lane/ },    { type: 'TOKEN_v128_2E_const', regex: /^v128\.const/ },    { type: 'TOKEN_i8x16_2E_shuffle', regex: /^i8x16\.shuffle/ },    { type: 'TOKEN_i8x16', regex: /^i8x16/ },    { type: 'TOKEN_i16x8', regex: /^i16x8/ },    { type: 'TOKEN_i32x4', regex: /^i32x4/ },    { type: 'TOKEN_i64x2', regex: /^i64x2/ },    { type: 'TOKEN_f32x4', regex: /^f32x4/ },    { type: 'TOKEN_f64x2', regex: /^f64x2/ },    { type: 'TOKEN_param', regex: /^param/ },    { type: 'TOKEN_result', regex: /^result/ },    { type: 'TOKEN_any', regex: /^any/ },    { type: 'TOKEN_eq', regex: /^eq/ },    { type: 'TOKEN_i31', regex: /^i31/ },    { type: 'TOKEN_none', regex: /^none/ },    { type: 'TOKEN_nofunc', regex: /^nofunc/ },    { type: 'TOKEN_exn', regex: /^exn/ },    { type: 'TOKEN_noexn', regex: /^noexn/ },    { type: 'TOKEN_extern', regex: /^extern/ },    { type: 'TOKEN_noextern', regex: /^noextern/ },    { type: 'TOKEN_funcref', regex: /^funcref/ },    { type: 'TOKEN_externref', regex: /^externref/ },    { type: 'TOKEN_exnref', regex: /^exnref/ },    { type: 'TOKEN_ref', regex: /^ref/ },    { type: 'TOKEN_null', regex: /^null/ },    { type: 'TOKEN_i32', regex: /^i32/ },    { type: 'TOKEN_i64', regex: /^i64/ },    { type: 'TOKEN_f32', regex: /^f32/ },    { type: 'TOKEN_f64', regex: /^f64/ },    { type: 'TOKEN_v128', regex: /^v128/ },    { type: 'TOKEN__5F_s', regex: /^_s/ },    { type: 'TOKEN__5F_u', regex: /^_u/ },    { type: 'TOKEN_offset_3D_', regex: /^offset=/ },    { type: 'TOKEN_align_3D_', regex: /^align=/ },    { type: 'skip', regex: /^(?:[\u0009\u000A\u000D\u0020]+|;;[^\n\r\u2028\u2029]*(?:\n|\r|\u2028|\u2029|$)|\(;[\s\S]*?;\))+/, skip: true },    { type: 'string', regex: /^"(?:(?:[\u0009]|[\u000a]|[\u000d]|[\u0020-\u0021]|[\u0023-\u005b]|[\u005d-\ud7ff]|[\ue000-\ufffd]|(?:[\ud800][\udc00-\udfff]|[\ud801-\udbfe][\udc00-\udfff]|[\udbff][\udc00-\udfff])|\\(?:[\u0000-\ud7ff]|[\ue000-\ufffd]|[\ud800][\udc00-\udfff]|[\ud801-\udbfe][\udc00-\udfff]|[\udbff][\udc00-\udfff])))*"/ },    { type: 'integer', regex: /^-(?:[0-9])+/ },    { type: 'nat', regex: /^(?:[0-9])+/ },    { type: 'float', regex: /^(?:(?:(?:\+|-))?(?:[0-9])+(?:(?:_(?:[0-9])+))*(?:\.(?:(?:[0-9])+(?:(?:_(?:[0-9])+))*)?)(?:(?:(?:e|E)(?:(?:\+|-))?(?:[0-9])+(?:(?:_(?:[0-9])+))*))?|(?:(?:\+|-))?(?:[0-9])+(?:(?:_(?:[0-9])+))*(?:(?:e|E)(?:(?:\+|-))?(?:[0-9])+(?:(?:_(?:[0-9])+))*)|(?:(?:\+|-))?0x(?:[0-9A-Fa-f])+(?:(?:_(?:[0-9A-Fa-f])+))*(?:(?:\.(?:(?:[0-9A-Fa-f])+(?:(?:_(?:[0-9A-Fa-f])+))*)?))?(?:(?:(?:p|P)(?:(?:\+|-))?(?:[0-9])+(?:(?:_(?:[0-9])+))*))?|(?:(?:\+|-))?inf|(?:(?:\+|-))?nan(?:(?::0x(?:[0-9A-Fa-f])+(?:(?:_(?:[0-9A-Fa-f])+))*))?)/ },    { type: 'sign', regex: /^(?:\+|-)/ },    { type: 'identifier', regex: /^\$[A-Za-z_](?:[A-Za-z0-9_])*/ },    { type: 'dottedName', regex: /^[A-Za-z_](?:[A-Za-z0-9_])*(?:(?:\.[A-Za-z_](?:[A-Za-z0-9_])*))+/ },    ];
  }

  isTemplateSpanPattern(pos, kind) {
    // Deterministic scan to avoid regex escaping issues in generated code.
    if (this.input[pos] !== '}') return false;
    const BACKTICK = String.fromCharCode(96);
    const max = Math.min(this.input.length, pos + 256);
    let i = pos + 1;
    while (i < max) {
      const ch = this.input[i];
      const next = this.input[i + 1];

      if (ch === '\\') {
        i += 2;
        continue;
      }

      if (ch === '$' && next === '{') {
        return kind === 'TemplateMiddle';
      }

      if (ch === BACKTICK) {
        return kind === 'TemplateTail';
      }

      i++;
    }
    return false;
  }

  enterTemplateSpan() {
    this.templateDepth++;
    this.templateBraceDepthStack.push(0);
  }

  exitTemplateSpan() {
    if (this.templateDepth > 0) {
      this.templateDepth--;
    }
    if (this.templateBraceDepthStack.length > 0) {
      this.templateBraceDepthStack.pop();
    }
  }

  currentTemplateBraceDepth() {
    return this.templateBraceDepthStack.length === 0
      ? 0
      : this.templateBraceDepthStack[this.templateBraceDepthStack.length - 1];
  }

  incrementTemplateBraceDepth() {
    if (this.templateBraceDepthStack.length > 0) {
      this.templateBraceDepthStack[this.templateBraceDepthStack.length - 1] += 1;
    }
  }

  decrementTemplateBraceDepth() {
    const index = this.templateBraceDepthStack.length - 1;
    if (index >= 0 && this.templateBraceDepthStack[index] > 0) {
      this.templateBraceDepthStack[index] -= 1;
    }
  }
  
  tokenize() {
    while (this.position < this.input.length) {
      let bestPattern = null;
      let bestMatch = null;
      const candidates = [];

      const isGenericNameType = (type) => (
        type === 'Name' || type === 'NameChar' || type === 'NameStartChar'
      );

      for (const pattern of this.tokenPatterns) {
        // Template spans are synthesized only when a closing brace ends the
        // active interpolation. Their raw patterns must not consume ordinary
        // braces from nested expressions.
        if (pattern.type === 'TemplateMiddle' || pattern.type === 'TemplateTail') {
          continue;
        }

        const regex = pattern.regex;
        const match = this.input.substring(this.position).match(regex);

        if (match && match.index === 0 && match[0].length > 0) {
          let effectivePattern = pattern;
          let effectiveMatch = match;
          // When parsing template expressions, disambiguate closing brace as template span boundary.
          if (this.templateDepth > 0
            && pattern.type === 'TOKEN__7D_'
            && this.currentTemplateBraceDepth() === 0) {
            if (this.isTemplateSpanPattern(this.position, 'TemplateMiddle')) {
              const templateMiddle = this.tokenPatterns.find((candidate) => candidate.type === 'TemplateMiddle');
              const templateMatch = templateMiddle
                ? this.input.substring(this.position).match(templateMiddle.regex)
                : null;
              if (templateMatch && templateMatch.index === 0 && templateMatch[0].length > 0) {
                effectivePattern = templateMiddle;
                effectiveMatch = templateMatch;
              }
            } else if (this.isTemplateSpanPattern(this.position, 'TemplateTail')) {
              const templateTail = this.tokenPatterns.find((candidate) => candidate.type === 'TemplateTail');
              const templateMatch = templateTail
                ? this.input.substring(this.position).match(templateTail.regex)
                : null;
              if (templateMatch && templateMatch.index === 0 && templateMatch[0].length > 0) {
                effectivePattern = templateTail;
                effectiveMatch = templateMatch;
              }
            }
          }

          candidates.push({ pattern: effectivePattern, match: effectiveMatch });
          if (!bestMatch
              || effectiveMatch[0].length > bestMatch[0].length
              || (effectiveMatch[0].length === bestMatch[0].length && effectivePattern.skip && !bestPattern.skip)
              || (effectiveMatch[0].length === bestMatch[0].length
                  && bestPattern
                  && isGenericNameType(bestPattern.type)
                  && !isGenericNameType(effectivePattern.type))) {
            bestPattern = effectivePattern;
            bestMatch = effectiveMatch;
          }
        }
      }

      // Inside character classes, prefer Char/CharCode/CharRange-like tokens
      // over generic global terminals such as '?>' that can overmatch.
      if (this.charClassDepth > 0 && candidates.length > 0) {
        const preferredTypes = new Set(['CharCodeRange', 'CharRange', 'CharCode', 'Char', 'TOKEN__5D_']);
        const preferred = candidates.filter(c => preferredTypes.has(c.pattern.type));
        if (preferred.length > 0) {
          let localBest = preferred[0];
          for (const c of preferred) {
            if (c.match[0].length > localBest.match[0].length) {
              localBest = c;
            }
          }
          bestPattern = localBest.pattern;
          bestMatch = localBest.match;
        }
      }

      // If current input starts with whitespace and a skip token is available,
      // prefer skipping whitespace first instead of consuming it as grammar data.
      if (candidates.length > 0 && /^\s/.test(this.input.substring(this.position, this.position + 1))) {
        const skipCandidates = candidates.filter(c => c.pattern.skip);
        if (skipCandidates.length > 0) {
          let localBest = skipCandidates[0];
          for (const c of skipCandidates) {
            if (c.match[0].length > localBest.match[0].length) {
              localBest = c;
            }
          }
          bestPattern = localBest.pattern;
          bestMatch = localBest.match;
        }
      }

      if (!bestMatch) {
        throw new Error(`Unexpected character at position ${this.position}: '${this.input[this.position]}'`);
      }

      if (!bestPattern.skip) {
        const matchedToken = {
          type: bestPattern.type,
          value: bestMatch[0],
          start: this.position,
          end: this.position + bestMatch[0].length
        };
        this.tokens.push(matchedToken);

        if (bestPattern.type === 'TOKEN__5B_' || bestPattern.type === 'TOKEN__5B__5E_') {
          this.charClassDepth++;
        } else if (bestPattern.type === 'TOKEN__5D_' && this.charClassDepth > 0) {
          this.charClassDepth--;
        } else if (bestPattern.type === 'TOKEN__7B_' && this.templateDepth > 0) {
          this.incrementTemplateBraceDepth();
        } else if (bestPattern.type === 'TOKEN__7D_' && this.templateDepth > 0) {
          this.decrementTemplateBraceDepth();
        } else if (bestPattern.type === 'TemplateHead') {
          this.enterTemplateSpan();
        } else if (bestPattern.type === 'TemplateTail') {
          this.exitTemplateSpan();
        }
      }

      this.position += bestMatch[0].length;
    }
    
    // Add EOF token
    this.tokens.push({
      type: 'EOF',
      value: '',
      start: this.position,
      end: this.position
    });
    
    return this.tokens;
  }
}

class Parser {
  constructor(input, eventHandler = null) {
    this.lexer = new Lexer(input);
    this.tokens = this.lexer.tokenize();
    this.position = 0;
    this.errors = [];
    this._lastError = null;
    this.eventHandler = eventHandler;
    this.failureMemo = new Set();
    this.successMemo = new Map();
    this._canMemoSuccess = !eventHandler || typeof eventHandler.appendNode === 'function';
  }
  
  peek(offset = 0) {
    return this.tokens[this.position + offset];
  }
  
  consume(expectedType) {
    const token = this.peek();
    if (!token || token.type !== expectedType) {
      const errObj = {
        expected: expectedType,
        found: token ? token.type : 'EOF',
        position: this.position
      };
      this._lastError = errObj;
      if (this.errors.length === 0 || this.position >= this.errors[this.errors.length - 1].position) {
        this.errors.length = 0;
        this.errors.push(errObj);
      }
      return false;
    }
    if (this.eventHandler && typeof this.eventHandler.terminal === 'function') {
      this.eventHandler.terminal(expectedType, token.value, this.position);
    }
    this.position++;
    return true;
  }
  
  match(expectedType) {
    const token = this.peek();
    if (token && token.type === expectedType) {
      if (this.eventHandler && typeof this.eventHandler.terminal === 'function') {
        this.eventHandler.terminal(expectedType, token.value, this.position);
      }
      this.position++;
      return true;
    }
    return false;
  }

  consumeContextual(expectedType) {
    const token = this.peek();
    if (token && token.type === expectedType) {
      return this.consume(expectedType);
    }

    const pattern = this.lexer.tokenPatterns.find((candidate) => candidate.type === expectedType);
    const match = pattern && token ? token.value.match(pattern.regex) : null;
    if (!match || match.index !== 0 || match[0].length !== token.value.length) {
      const errObj = {
        expected: expectedType,
        found: token ? token.type : 'EOF',
        position: this.position
      };
      this._lastError = errObj;
      if (this.errors.length === 0 || this.position >= this.errors[this.errors.length - 1].position) {
        this.errors.length = 0;
        this.errors.push(errObj);
      }
      return false;
    }

    if (this.eventHandler && typeof this.eventHandler.terminal === 'function') {
      this.eventHandler.terminal(token.type, token.value, this.position);
    }
    this.position++;
    return true;
  }

  markEventState() {
    if (this.eventHandler && typeof this.eventHandler.checkpoint === 'function') {
      return this.eventHandler.checkpoint();
    }
    return null;
  }

  restoreEventState(mark) {
    if (mark !== null && this.eventHandler && typeof this.eventHandler.restore === 'function') {
      this.eventHandler.restore(mark);
    }
  }
  
  getErrorMessage() {
    if (this.errors.length === 0) return 'No errors';
    const err = this.errors[0];
    return `Syntax error: expected ${err.expected}, got ${err.found}`;
  }
  parse() {
    if (!this.parsewat()) {
      const err = this._lastError || this.errors[this.errors.length - 1];
      throw new Error(err ? `Expected '${err.expected}', got '${err.found}'` : this.getErrorMessage());
    }
    const next = this.peek();
    if (!next && this.position === this.tokens.length) {
      return undefined;
    }
    if (!next || next.type !== 'EOF') {
      throw new Error(`Unexpected token at end: ${next ? next.type : 'EOF(consumed)'}`);
    }
    return undefined;
  }
  parsewat() {
    const __memoStart = this.position;
    const __memoKey = 'wat@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('wat', this.position);
    }
    const __ok = this._parsewatBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('wat', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('wat', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsewatBody() {
    if (!this.parsewatBody()) { return false; }

    return true;
  }
  parsewatBody() {
    const __memoStart = this.position;
    const __memoKey = 'watBody@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('watBody', this.position);
    }
    const __ok = this._parsewatBodyBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('watBody', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('watBody', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsewatBodyBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.parsemodule()) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('eof')) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsemodule() {
    const __memoStart = this.position;
    const __memoKey = 'module@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('module', this.position);
    }
    const __ok = this._parsemoduleBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('module', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('module', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsemoduleBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_module')) { return false; }
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsemoduleField()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parsemoduleField() {
    const __memoStart = this.position;
    const __memoKey = 'moduleField@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('moduleField', this.position);
    }
    const __ok = this._parsemoduleFieldBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('moduleField', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('moduleField', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsemoduleFieldBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.parsetypeDef()) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.parserecDef()) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.parseimportDef()) { _ok_3 = false; }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_4 = true;
    if (!this.parsetagDef()) { _ok_4 = false; }
      if (_ok_4) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_5 = true;
    if (!this.parseglobalDef()) { _ok_5 = false; }
      if (_ok_5) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_6 = true;
    if (!this.parsememDef()) { _ok_6 = false; }
      if (_ok_6) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_7 = true;
    if (!this.parsetableDef()) { _ok_7 = false; }
      if (_ok_7) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_8 = true;
    if (!this.parsefuncDef()) { _ok_8 = false; }
      if (_ok_8) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_9 = true;
    if (!this.parsedataDef()) { _ok_9 = false; }
      if (_ok_9) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_10 = true;
    if (!this.parseelemDef()) { _ok_10 = false; }
      if (_ok_10) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_11 = true;
    if (!this.parsestartDef()) { _ok_11 = false; }
      if (_ok_11) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_12 = true;
    if (!this.parseexportDef()) { _ok_12 = false; }
      if (_ok_12) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsetypeDef() {
    const __memoStart = this.position;
    const __memoKey = 'typeDef@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('typeDef', this.position);
    }
    const __ok = this._parsetypeDefBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('typeDef', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('typeDef', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsetypeDefBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_type')) { return false; }
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    if (!this.parserectype()) { return false; }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parserecDef() {
    const __memoStart = this.position;
    const __memoKey = 'recDef@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('recDef', this.position);
    }
    const __ok = this._parserecDefBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('recDef', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('recDef', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parserecDefBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_rec')) { return false; }
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsetypeDef()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parserectype() {
    const __memoStart = this.position;
    const __memoKey = 'rectype@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('rectype', this.position);
    }
    const __ok = this._parserectypeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('rectype', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('rectype', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parserectypeBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN__28_')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.consume('TOKEN_rec')) { _ok_1 = false; }
      }
      if (_ok_1) {
    {
      let count = 0;
      while (true) {
        const savePos = this.position;
        const saveMark = this.markEventState();
        if (!this.parsesubtype()) {
          this.position = savePos;
          this.restoreEventState(saveMark);
          break;
        }
        if (this.position === savePos) break;
        count++;
      }
      if (count === 0) {
        _ok_1 = false;
      }
    }
      }
      if (_ok_1) {
    if (!this.consume('TOKEN__29_')) { _ok_1 = false; }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.parsesubtype()) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsesubtype() {
    const __memoStart = this.position;
    const __memoKey = 'subtype@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('subtype', this.position);
    }
    const __ok = this._parsesubtypeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('subtype', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('subtype', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsesubtypeBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN__28_')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.consume('TOKEN_sub')) { _ok_1 = false; }
      }
      if (_ok_1) {
    // Optional: try parsing final
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsefinal()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_1) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsesupertype()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_1) {
    if (!this.parsecomptype()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.consume('TOKEN__29_')) { _ok_1 = false; }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.parsecomptype()) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsefinal() {
    const __memoStart = this.position;
    const __memoKey = 'final@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('final', this.position);
    }
    const __ok = this._parsefinalBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('final', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('final', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsefinalBody() {
    if (!this.consume('TOKEN_final')) { return false; }

    return true;
  }
  parsesupertype() {
    const __memoStart = this.position;
    const __memoKey = 'supertype@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('supertype', this.position);
    }
    const __ok = this._parsesupertypeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('supertype', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('supertype', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsesupertypeBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.parsetypeidx()) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.parsetypeuse()) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsecomptype() {
    const __memoStart = this.position;
    const __memoKey = 'comptype@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('comptype', this.position);
    }
    const __ok = this._parsecomptypeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('comptype', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('comptype', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsecomptypeBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.parsefuncType()) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.parsestructType()) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.parsearrayType()) { _ok_3 = false; }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsefuncType() {
    const __memoStart = this.position;
    const __memoKey = 'funcType@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('funcType', this.position);
    }
    const __ok = this._parsefuncTypeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('funcType', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('funcType', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsefuncTypeBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_func')) { return false; }
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseparamDecl()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseresultDecl()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parsestructType() {
    const __memoStart = this.position;
    const __memoKey = 'structType@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('structType', this.position);
    }
    const __ok = this._parsestructTypeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('structType', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('structType', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsestructTypeBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_struct')) { return false; }
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsefieldDecl()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parsearrayType() {
    const __memoStart = this.position;
    const __memoKey = 'arrayType@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('arrayType', this.position);
    }
    const __ok = this._parsearrayTypeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('arrayType', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('arrayType', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsearrayTypeBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_array')) { return false; }
    // Group
    {
      let _matchedAlt = false;
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        let _ok_1 = true;
    if (!this.parsefieldDecl()) { _ok_1 = false; }
        if (_ok_1) {
          _matchedAlt = true;
        } else {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        let _ok_2 = true;
    if (!this.parsefieldType()) { _ok_2 = false; }
        if (_ok_2) {
          _matchedAlt = true;
        } else {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) { return false; }
    }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parsefieldDecl() {
    const __memoStart = this.position;
    const __memoKey = 'fieldDecl@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('fieldDecl', this.position);
    }
    const __ok = this._parsefieldDeclBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('fieldDecl', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('fieldDecl', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsefieldDeclBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_field')) { return false; }
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    if (!this.parsefieldType()) { return false; }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parsefieldType() {
    const __memoStart = this.position;
    const __memoKey = 'fieldType@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('fieldType', this.position);
    }
    const __ok = this._parsefieldTypeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('fieldType', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('fieldType', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsefieldTypeBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN__28_')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.consume('TOKEN_mut')) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsestoragetype()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.consume('TOKEN__29_')) { _ok_1 = false; }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.parsestoragetype()) { _ok_2 = false; }
      if (_ok_2) {
    // Optional: try parsing mutField
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsemutField()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsemutField() {
    const __memoStart = this.position;
    const __memoKey = 'mutField@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('mutField', this.position);
    }
    const __ok = this._parsemutFieldBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('mutField', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('mutField', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsemutFieldBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_mut')) { return false; }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parsestoragetype() {
    const __memoStart = this.position;
    const __memoKey = 'storagetype@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('storagetype', this.position);
    }
    const __ok = this._parsestoragetypeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('storagetype', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('storagetype', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsestoragetypeBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.parsevalueType()) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.parsepackType()) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsepackType() {
    const __memoStart = this.position;
    const __memoKey = 'packType@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('packType', this.position);
    }
    const __ok = this._parsepackTypeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('packType', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('packType', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsepackTypeBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN_i8')) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN_i16')) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsetagDef() {
    const __memoStart = this.position;
    const __memoKey = 'tagDef@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('tagDef', this.position);
    }
    const __ok = this._parsetagDefBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('tagDef', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('tagDef', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsetagDefBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_tag')) { return false; }
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinlineExport()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
    if (!this.parsetagType()) { return false; }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parsetagType() {
    const __memoStart = this.position;
    const __memoKey = 'tagType@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('tagType', this.position);
    }
    const __ok = this._parsetagTypeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('tagType', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('tagType', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsetagTypeBody() {
    if (!this.parsetypeuse()) { return false; }

    return true;
  }
  parseglobalDef() {
    const __memoStart = this.position;
    const __memoKey = 'globalDef@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('globalDef', this.position);
    }
    const __ok = this._parseglobalDefBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('globalDef', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('globalDef', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseglobalDefBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_global')) { return false; }
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinlineExport()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
    if (!this.parseglobalType()) { return false; }
    if (!this.parseexpr()) { return false; }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parseglobalType() {
    const __memoStart = this.position;
    const __memoKey = 'globalType@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('globalType', this.position);
    }
    const __ok = this._parseglobalTypeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('globalType', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('globalType', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseglobalTypeBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.parsevalueType()) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN__28_')) { _ok_2 = false; }
      if (_ok_2) {
    if (!this.consume('TOKEN_mut')) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.parsevalueType()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.consume('TOKEN__29_')) { _ok_2 = false; }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsememDef() {
    const __memoStart = this.position;
    const __memoKey = 'memDef@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('memDef', this.position);
    }
    const __ok = this._parsememDefBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('memDef', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('memDef', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsememDefBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_memory')) { return false; }
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinlineExport()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
    if (!this.parselimits()) { return false; }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parsetableDef() {
    const __memoStart = this.position;
    const __memoKey = 'tableDef@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('tableDef', this.position);
    }
    const __ok = this._parsetableDefBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('tableDef', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('tableDef', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsetableDefBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN__28_')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.consume('TOKEN_table')) { _ok_1 = false; }
      }
      if (_ok_1) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_1) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinlineExport()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_1) {
    if (!this.parselimits()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsereftype()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.consume('TOKEN__29_')) { _ok_1 = false; }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN__28_')) { _ok_2 = false; }
      if (_ok_2) {
    if (!this.consume('TOKEN_table')) { _ok_2 = false; }
      }
      if (_ok_2) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_2) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinlineExport()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_2) {
    if (!this.parselimits()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.parsereftype()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.parsetableExpr()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.consume('TOKEN__29_')) { _ok_2 = false; }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsetableExpr() {
    const __memoStart = this.position;
    const __memoKey = 'tableExpr@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('tableExpr', this.position);
    }
    const __ok = this._parsetableExprBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('tableExpr', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('tableExpr', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsetableExprBody() {
    if (!this.parseexpr()) { return false; }

    return true;
  }
  parsefuncDef() {
    const __memoStart = this.position;
    const __memoKey = 'funcDef@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('funcDef', this.position);
    }
    const __ok = this._parsefuncDefBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('funcDef', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('funcDef', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsefuncDefBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_func')) { return false; }
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinlineExport()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
    // Optional: try parsing typeuse
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsetypeuse()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parselocalDecl()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
    if (!this.parseexpr()) { return false; }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parselocalDecl() {
    const __memoStart = this.position;
    const __memoKey = 'localDecl@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('localDecl', this.position);
    }
    const __ok = this._parselocalDeclBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('localDecl', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('localDecl', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parselocalDeclBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN__28_')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.consume('TOKEN_local')) { _ok_1 = false; }
      }
      if (_ok_1) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_1) {
    if (!this.parsevalueType()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.consume('TOKEN__29_')) { _ok_1 = false; }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN__28_')) { _ok_2 = false; }
      if (_ok_2) {
    if (!this.consume('TOKEN_local')) { _ok_2 = false; }
      }
      if (_ok_2) {
    {
      let count = 0;
      while (true) {
        const savePos = this.position;
        const saveMark = this.markEventState();
        if (!this.parsevalueType()) {
          this.position = savePos;
          this.restoreEventState(saveMark);
          break;
        }
        if (this.position === savePos) break;
        count++;
      }
      if (count === 0) {
        _ok_2 = false;
      }
    }
      }
      if (_ok_2) {
    if (!this.consume('TOKEN__29_')) { _ok_2 = false; }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parseinlineExport() {
    const __memoStart = this.position;
    const __memoKey = 'inlineExport@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('inlineExport', this.position);
    }
    const __ok = this._parseinlineExportBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('inlineExport', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('inlineExport', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseinlineExportBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_export')) { return false; }
    if (!this.consume('string')) { return false; }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parseimportDef() {
    const __memoStart = this.position;
    const __memoKey = 'importDef@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('importDef', this.position);
    }
    const __ok = this._parseimportDefBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('importDef', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('importDef', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseimportDefBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_import')) { return false; }
    if (!this.consume('string')) { return false; }
    if (!this.consume('string')) { return false; }
    if (!this.parseimportDesc()) { return false; }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parseimportDesc() {
    const __memoStart = this.position;
    const __memoKey = 'importDesc@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('importDesc', this.position);
    }
    const __ok = this._parseimportDescBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('importDesc', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('importDesc', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseimportDescBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN__28_')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.consume('TOKEN_func')) { _ok_1 = false; }
      }
      if (_ok_1) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_1) {
    // Optional: try parsing typeuse
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsetypeuse()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_1) {
    if (!this.consume('TOKEN__29_')) { _ok_1 = false; }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN__28_')) { _ok_2 = false; }
      if (_ok_2) {
    if (!this.consume('TOKEN_table')) { _ok_2 = false; }
      }
      if (_ok_2) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_2) {
    if (!this.parselimits()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.parsereftype()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.consume('TOKEN__29_')) { _ok_2 = false; }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.consume('TOKEN__28_')) { _ok_3 = false; }
      if (_ok_3) {
    if (!this.consume('TOKEN_memory')) { _ok_3 = false; }
      }
      if (_ok_3) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_3) {
    if (!this.parselimits()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.consume('TOKEN__29_')) { _ok_3 = false; }
      }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_4 = true;
    if (!this.consume('TOKEN__28_')) { _ok_4 = false; }
      if (_ok_4) {
    if (!this.consume('TOKEN_global')) { _ok_4 = false; }
      }
      if (_ok_4) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_4) {
    if (!this.parseglobalType()) { _ok_4 = false; }
      }
      if (_ok_4) {
    if (!this.consume('TOKEN__29_')) { _ok_4 = false; }
      }
      if (_ok_4) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_5 = true;
    if (!this.consume('TOKEN__28_')) { _ok_5 = false; }
      if (_ok_5) {
    if (!this.consume('TOKEN_tag')) { _ok_5 = false; }
      }
      if (_ok_5) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_5) {
    if (!this.parsetagType()) { _ok_5 = false; }
      }
      if (_ok_5) {
    if (!this.consume('TOKEN__29_')) { _ok_5 = false; }
      }
      if (_ok_5) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parseexportDef() {
    const __memoStart = this.position;
    const __memoKey = 'exportDef@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('exportDef', this.position);
    }
    const __ok = this._parseexportDefBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('exportDef', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('exportDef', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseexportDefBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_export')) { return false; }
    if (!this.consume('string')) { return false; }
    if (!this.parseexportDesc()) { return false; }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parseexportDesc() {
    const __memoStart = this.position;
    const __memoKey = 'exportDesc@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('exportDesc', this.position);
    }
    const __ok = this._parseexportDescBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('exportDesc', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('exportDesc', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseexportDescBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN__28_')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.consume('TOKEN_func')) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parseindex()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.consume('TOKEN__29_')) { _ok_1 = false; }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN__28_')) { _ok_2 = false; }
      if (_ok_2) {
    if (!this.consume('TOKEN_table')) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.parseindex()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.consume('TOKEN__29_')) { _ok_2 = false; }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.consume('TOKEN__28_')) { _ok_3 = false; }
      if (_ok_3) {
    if (!this.consume('TOKEN_memory')) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parseindex()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.consume('TOKEN__29_')) { _ok_3 = false; }
      }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_4 = true;
    if (!this.consume('TOKEN__28_')) { _ok_4 = false; }
      if (_ok_4) {
    if (!this.consume('TOKEN_global')) { _ok_4 = false; }
      }
      if (_ok_4) {
    if (!this.parseindex()) { _ok_4 = false; }
      }
      if (_ok_4) {
    if (!this.consume('TOKEN__29_')) { _ok_4 = false; }
      }
      if (_ok_4) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_5 = true;
    if (!this.consume('TOKEN__28_')) { _ok_5 = false; }
      if (_ok_5) {
    if (!this.consume('TOKEN_tag')) { _ok_5 = false; }
      }
      if (_ok_5) {
    if (!this.parseindex()) { _ok_5 = false; }
      }
      if (_ok_5) {
    if (!this.consume('TOKEN__29_')) { _ok_5 = false; }
      }
      if (_ok_5) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsestartDef() {
    const __memoStart = this.position;
    const __memoKey = 'startDef@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('startDef', this.position);
    }
    const __ok = this._parsestartDefBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('startDef', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('startDef', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsestartDefBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_start')) { return false; }
    if (!this.parseindex()) { return false; }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parsedataDef() {
    const __memoStart = this.position;
    const __memoKey = 'dataDef@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('dataDef', this.position);
    }
    const __ok = this._parsedataDefBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('dataDef', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('dataDef', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsedataDefBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN__28_')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.consume('TOKEN_data')) { _ok_1 = false; }
      }
      if (_ok_1) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_1) {
    if (!this.parsedatastring()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.consume('TOKEN__29_')) { _ok_1 = false; }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN__28_')) { _ok_2 = false; }
      if (_ok_2) {
    if (!this.consume('TOKEN_data')) { _ok_2 = false; }
      }
      if (_ok_2) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_2) {
    if (!this.parsememUse()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.parseoffset()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.parsedatastring()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.consume('TOKEN__29_')) { _ok_2 = false; }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.consume('TOKEN__28_')) { _ok_3 = false; }
      if (_ok_3) {
    if (!this.consume('TOKEN_data')) { _ok_3 = false; }
      }
      if (_ok_3) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_3) {
    if (!this.parseoffset()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parsedatastring()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.consume('TOKEN__29_')) { _ok_3 = false; }
      }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsedatastring() {
    const __memoStart = this.position;
    const __memoKey = 'datastring@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('datastring', this.position);
    }
    const __ok = this._parsedatastringBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('datastring', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('datastring', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsedatastringBody() {
    if (!this.consume('string')) { return false; } else { while (this.match('string')) { /* one or more */ } }

    return true;
  }
  parseelemDef() {
    const __memoStart = this.position;
    const __memoKey = 'elemDef@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('elemDef', this.position);
    }
    const __ok = this._parseelemDefBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('elemDef', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('elemDef', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseelemDefBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN__28_')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.consume('TOKEN_elem')) { _ok_1 = false; }
      }
      if (_ok_1) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_1) {
    if (!this.parseelemList()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.consume('TOKEN__29_')) { _ok_1 = false; }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN__28_')) { _ok_2 = false; }
      if (_ok_2) {
    if (!this.consume('TOKEN_elem')) { _ok_2 = false; }
      }
      if (_ok_2) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_2) {
    if (!this.parsetableUse()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.parseoffset()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.parseelemList()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.consume('TOKEN__29_')) { _ok_2 = false; }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.consume('TOKEN__28_')) { _ok_3 = false; }
      if (_ok_3) {
    if (!this.consume('TOKEN_elem')) { _ok_3 = false; }
      }
      if (_ok_3) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_3) {
    if (!this.parseoffset()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parseelemList()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.consume('TOKEN__29_')) { _ok_3 = false; }
      }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_4 = true;
    if (!this.consume('TOKEN__28_')) { _ok_4 = false; }
      if (_ok_4) {
    if (!this.consume('TOKEN_elem')) { _ok_4 = false; }
      }
      if (_ok_4) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_4) {
    if (!this.consume('TOKEN_declare')) { _ok_4 = false; }
      }
      if (_ok_4) {
    if (!this.parseelemList()) { _ok_4 = false; }
      }
      if (_ok_4) {
    if (!this.consume('TOKEN__29_')) { _ok_4 = false; }
      }
      if (_ok_4) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parseelemList() {
    const __memoStart = this.position;
    const __memoKey = 'elemList@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('elemList', this.position);
    }
    const __ok = this._parseelemListBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('elemList', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('elemList', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseelemListBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.parsereftype()) { _ok_1 = false; }
      if (_ok_1) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseelemExpr()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN_func')) { _ok_2 = false; }
      if (_ok_2) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsefuncidx()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parseelemExpr() {
    const __memoStart = this.position;
    const __memoKey = 'elemExpr@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('elemExpr', this.position);
    }
    const __ok = this._parseelemExprBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('elemExpr', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('elemExpr', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseelemExprBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN__28_')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.consume('TOKEN_item')) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parseexpr()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.consume('TOKEN__29_')) { _ok_1 = false; }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.parseinstr()) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsememUse() {
    const __memoStart = this.position;
    const __memoKey = 'memUse@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('memUse', this.position);
    }
    const __ok = this._parsememUseBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('memUse', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('memUse', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsememUseBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_memory')) { return false; }
    if (!this.parsememidx()) { return false; }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parsetableUse() {
    const __memoStart = this.position;
    const __memoKey = 'tableUse@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('tableUse', this.position);
    }
    const __ok = this._parsetableUseBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('tableUse', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('tableUse', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsetableUseBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_table')) { return false; }
    if (!this.parsetableidx()) { return false; }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parseoffset() {
    const __memoStart = this.position;
    const __memoKey = 'offset@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('offset', this.position);
    }
    const __ok = this._parseoffsetBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('offset', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('offset', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseoffsetBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN__28_')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.consume('TOKEN_offset')) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parseexpr()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.consume('TOKEN__29_')) { _ok_1 = false; }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.parseexpr()) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parseinstr() {
    const __memoStart = this.position;
    const __memoKey = 'instr@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('instr', this.position);
    }
    const __ok = this._parseinstrBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('instr', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('instr', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseinstrBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.parsefoldedInstr()) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.parseseqInstr()) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsefoldedInstr() {
    const __memoStart = this.position;
    const __memoKey = 'foldedInstr@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('foldedInstr', this.position);
    }
    const __ok = this._parsefoldedInstrBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('foldedInstr', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('foldedInstr', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsefoldedInstrBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN__28_')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.consume('TOKEN_block')) { _ok_1 = false; }
      }
      if (_ok_1) {
    // Optional: try parsing label
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parselabel()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_1) {
    // Optional: try parsing blockType
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseblockType()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_1) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinstr()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_1) {
    if (!this.consume('TOKEN__29_')) { _ok_1 = false; }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN__28_')) { _ok_2 = false; }
      if (_ok_2) {
    if (!this.consume('TOKEN_loop')) { _ok_2 = false; }
      }
      if (_ok_2) {
    // Optional: try parsing label
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parselabel()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_2) {
    // Optional: try parsing blockType
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseblockType()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_2) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinstr()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_2) {
    if (!this.consume('TOKEN__29_')) { _ok_2 = false; }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.consume('TOKEN__28_')) { _ok_3 = false; }
      if (_ok_3) {
    if (!this.consume('TOKEN_if')) { _ok_3 = false; }
      }
      if (_ok_3) {
    // Optional: try parsing label
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parselabel()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_3) {
    // Optional: try parsing blockType
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseblockType()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_3) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinstr()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_3) {
    // Group ?
    {
      const _optStart = this.position;
      const _optMark = this.markEventState();
      let _ok_4 = true;
    if (!this.consume('TOKEN__28_')) { _ok_4 = false; }
      if (_ok_4) {
    if (!this.consume('TOKEN_then')) { _ok_4 = false; }
      }
      if (_ok_4) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinstr()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_4) {
    if (!this.consume('TOKEN__29_')) { _ok_4 = false; }
      }
      if (_ok_4) {
    // Group ?
    {
      const _optStart = this.position;
      const _optMark = this.markEventState();
      let _ok_5 = true;
    if (!this.consume('TOKEN__28_')) { _ok_5 = false; }
      if (_ok_5) {
    if (!this.consume('TOKEN_else')) { _ok_5 = false; }
      }
      if (_ok_5) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinstr()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_5) {
    if (!this.consume('TOKEN__29_')) { _ok_5 = false; }
      }
      if (!_ok_5) {
        this.position = _optStart;
        this.restoreEventState(_optMark);
      }
    }
      }
      if (!_ok_4) {
        this.position = _optStart;
        this.restoreEventState(_optMark);
      }
    }
      }
      if (_ok_3) {
    if (!this.consume('TOKEN__29_')) { _ok_3 = false; }
      }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_6 = true;
    if (!this.consume('TOKEN__28_')) { _ok_6 = false; }
      if (_ok_6) {
    if (!this.consume('TOKEN_try')) { _ok_6 = false; }
      }
      if (_ok_6) {
    // Optional: try parsing label
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parselabel()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_6) {
    // Optional: try parsing blockType
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseblockType()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_6) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinstr()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_6) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parselegacyCatchClause()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_6) {
    if (!this.consume('TOKEN__29_')) { _ok_6 = false; }
      }
      if (_ok_6) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_7 = true;
    if (!this.consume('TOKEN__28_')) { _ok_7 = false; }
      if (_ok_7) {
    if (!this.consume('TOKEN_try_5F_table')) { _ok_7 = false; }
      }
      if (_ok_7) {
    // Optional: try parsing label
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parselabel()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_7) {
    // Optional: try parsing blockType
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseblockType()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_7) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsecatchClause()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_7) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinstr()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_7) {
    if (!this.consume('TOKEN__29_')) { _ok_7 = false; }
      }
      if (_ok_7) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_8 = true;
    if (!this.consume('TOKEN__28_')) { _ok_8 = false; }
      if (_ok_8) {
    if (!this.parsenonBlockInstr()) { _ok_8 = false; }
      }
      if (_ok_8) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinstr()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_8) {
    if (!this.consume('TOKEN__29_')) { _ok_8 = false; }
      }
      if (_ok_8) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsecatchClause() {
    const __memoStart = this.position;
    const __memoKey = 'catchClause@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('catchClause', this.position);
    }
    const __ok = this._parsecatchClauseBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('catchClause', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('catchClause', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsecatchClauseBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN__28_')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.consume('TOKEN_catch')) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsetagidx()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parselabelidx()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.consume('TOKEN__29_')) { _ok_1 = false; }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN__28_')) { _ok_2 = false; }
      if (_ok_2) {
    if (!this.consume('TOKEN_catch_5F_ref')) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.parsetagidx()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.parselabelidx()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.consume('TOKEN__29_')) { _ok_2 = false; }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.consume('TOKEN__28_')) { _ok_3 = false; }
      if (_ok_3) {
    if (!this.consume('TOKEN_catch_5F_all')) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parselabelidx()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.consume('TOKEN__29_')) { _ok_3 = false; }
      }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_4 = true;
    if (!this.consume('TOKEN__28_')) { _ok_4 = false; }
      if (_ok_4) {
    if (!this.consume('TOKEN_catch_5F_all_5F_ref')) { _ok_4 = false; }
      }
      if (_ok_4) {
    if (!this.parselabelidx()) { _ok_4 = false; }
      }
      if (_ok_4) {
    if (!this.consume('TOKEN__29_')) { _ok_4 = false; }
      }
      if (_ok_4) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parselegacyCatchClause() {
    const __memoStart = this.position;
    const __memoKey = 'legacyCatchClause@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('legacyCatchClause', this.position);
    }
    const __ok = this._parselegacyCatchClauseBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('legacyCatchClause', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('legacyCatchClause', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parselegacyCatchClauseBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN_catch')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.parsetagidx()) { _ok_1 = false; }
      }
      if (_ok_1) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinstr()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN_catch_5F_all')) { _ok_2 = false; }
      if (_ok_2) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinstr()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parseseqInstr() {
    const __memoStart = this.position;
    const __memoKey = 'seqInstr@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('seqInstr', this.position);
    }
    const __ok = this._parseseqInstrBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('seqInstr', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('seqInstr', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseseqInstrBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.parsenonBlockInstr()) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN_block')) { _ok_2 = false; }
      if (_ok_2) {
    // Optional: try parsing label
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parselabel()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_2) {
    // Optional: try parsing blockType
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseblockType()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_2) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinstr()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_2) {
    if (!this.consume('TOKEN_end')) { _ok_2 = false; }
      }
      if (_ok_2) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.consume('TOKEN_loop')) { _ok_3 = false; }
      if (_ok_3) {
    // Optional: try parsing label
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parselabel()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_3) {
    // Optional: try parsing blockType
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseblockType()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_3) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinstr()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_3) {
    if (!this.consume('TOKEN_end')) { _ok_3 = false; }
      }
      if (_ok_3) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_4 = true;
    if (!this.consume('TOKEN_if')) { _ok_4 = false; }
      if (_ok_4) {
    // Optional: try parsing label
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parselabel()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_4) {
    // Optional: try parsing blockType
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseblockType()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_4) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinstr()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_4) {
    // Group ?
    {
      const _optStart = this.position;
      const _optMark = this.markEventState();
      let _ok_5 = true;
    if (!this.consume('TOKEN_else')) { _ok_5 = false; }
      if (_ok_5) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_5) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinstr()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (!_ok_5) {
        this.position = _optStart;
        this.restoreEventState(_optMark);
      }
    }
      }
      if (_ok_4) {
    if (!this.consume('TOKEN_end')) { _ok_4 = false; }
      }
      if (_ok_4) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_4) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_6 = true;
    if (!this.consume('TOKEN_try')) { _ok_6 = false; }
      if (_ok_6) {
    // Optional: try parsing label
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parselabel()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_6) {
    // Optional: try parsing blockType
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseblockType()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_6) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinstr()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_6) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parselegacyCatchClause()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_6) {
    if (!this.consume('TOKEN_end')) { _ok_6 = false; }
      }
      if (_ok_6) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_6) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_7 = true;
    if (!this.consume('TOKEN_try_5F_table')) { _ok_7 = false; }
      if (_ok_7) {
    // Optional: try parsing label
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parselabel()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_7) {
    // Optional: try parsing blockType
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseblockType()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_7) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsecatchClause()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_7) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinstr()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_7) {
    if (!this.consume('TOKEN_end')) { _ok_7 = false; }
      }
      if (_ok_7) {
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_7) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsenonBlockInstr() {
    const __memoStart = this.position;
    const __memoKey = 'nonBlockInstr@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('nonBlockInstr', this.position);
    }
    const __ok = this._parsenonBlockInstrBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('nonBlockInstr', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('nonBlockInstr', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsenonBlockInstrBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN_nop')) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN_unreachable')) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.consume('TOKEN_drop')) { _ok_3 = false; }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_4 = true;
    if (!this.consume('TOKEN_return')) { _ok_4 = false; }
      if (_ok_4) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_5 = true;
    if (!this.consume('TOKEN_throw_5F_ref')) { _ok_5 = false; }
      if (_ok_5) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_6 = true;
    if (!this.consume('TOKEN_select')) { _ok_6 = false; }
      if (_ok_6) {
    // Optional: try parsing resultTypes
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseresultTypes()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_6) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_7 = true;
    if (!this.parsefloatConstInstr()) { _ok_7 = false; }
      if (_ok_7) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_8 = true;
    if (!this.parsememoryAccessInstr()) { _ok_8 = false; }
      if (_ok_8) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_9 = true;
    if (!this.parsesimdLikeInstr()) { _ok_9 = false; }
      if (_ok_9) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_10 = true;
    if (!this.parsenumericLikeInstr()) { _ok_10 = false; }
      if (_ok_10) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_11 = true;
    if (!this.parsememLikeInstr()) { _ok_11 = false; }
      if (_ok_11) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_12 = true;
    if (!this.consume('TOKEN_local_2E_get')) { _ok_12 = false; }
      if (_ok_12) {
    if (!this.parseindex()) { _ok_12 = false; }
      }
      if (_ok_12) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_13 = true;
    if (!this.consume('TOKEN_local_2E_set')) { _ok_13 = false; }
      if (_ok_13) {
    if (!this.parseindex()) { _ok_13 = false; }
      }
      if (_ok_13) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_14 = true;
    if (!this.consume('TOKEN_local_2E_tee')) { _ok_14 = false; }
      if (_ok_14) {
    if (!this.parseindex()) { _ok_14 = false; }
      }
      if (_ok_14) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_15 = true;
    if (!this.consume('TOKEN_global_2E_get')) { _ok_15 = false; }
      if (_ok_15) {
    if (!this.parseindex()) { _ok_15 = false; }
      }
      if (_ok_15) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_16 = true;
    if (!this.consume('TOKEN_global_2E_set')) { _ok_16 = false; }
      if (_ok_16) {
    if (!this.parseindex()) { _ok_16 = false; }
      }
      if (_ok_16) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_17 = true;
    if (!this.consume('TOKEN_table_2E_get')) { _ok_17 = false; }
      if (_ok_17) {
    if (!this.parsetableidx()) { _ok_17 = false; }
      }
      if (_ok_17) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_18 = true;
    if (!this.consume('TOKEN_table_2E_set')) { _ok_18 = false; }
      if (_ok_18) {
    if (!this.parsetableidx()) { _ok_18 = false; }
      }
      if (_ok_18) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_19 = true;
    if (!this.consume('TOKEN_table_2E_size')) { _ok_19 = false; }
      if (_ok_19) {
    if (!this.parsetableidx()) { _ok_19 = false; }
      }
      if (_ok_19) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_20 = true;
    if (!this.consume('TOKEN_table_2E_grow')) { _ok_20 = false; }
      if (_ok_20) {
    if (!this.parsetableidx()) { _ok_20 = false; }
      }
      if (_ok_20) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_21 = true;
    if (!this.consume('TOKEN_table_2E_fill')) { _ok_21 = false; }
      if (_ok_21) {
    if (!this.parsetableidx()) { _ok_21 = false; }
      }
      if (_ok_21) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_22 = true;
    if (!this.consume('TOKEN_table_2E_copy')) { _ok_22 = false; }
      if (_ok_22) {
    if (!this.parsetableidx()) { _ok_22 = false; }
      }
      if (_ok_22) {
    if (!this.parsetableidx()) { _ok_22 = false; }
      }
      if (_ok_22) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_23 = true;
    if (!this.consume('TOKEN_table_2E_init')) { _ok_23 = false; }
      if (_ok_23) {
    if (!this.parsetableidx()) { _ok_23 = false; }
      }
      if (_ok_23) {
    if (!this.parseelemidx()) { _ok_23 = false; }
      }
      if (_ok_23) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_24 = true;
    if (!this.consume('TOKEN_elem_2E_drop')) { _ok_24 = false; }
      if (_ok_24) {
    if (!this.parseelemidx()) { _ok_24 = false; }
      }
      if (_ok_24) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_25 = true;
    if (!this.consume('TOKEN_memory_2E_size')) { _ok_25 = false; }
      if (_ok_25) {
    // Optional: try parsing memidx
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsememidx()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_25) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_26 = true;
    if (!this.consume('TOKEN_memory_2E_grow')) { _ok_26 = false; }
      if (_ok_26) {
    // Optional: try parsing memidx
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsememidx()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_26) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_27 = true;
    if (!this.consume('TOKEN_memory_2E_fill')) { _ok_27 = false; }
      if (_ok_27) {
    // Optional: try parsing memidx
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsememidx()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_27) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_28 = true;
    if (!this.consume('TOKEN_memory_2E_copy')) { _ok_28 = false; }
      if (_ok_28) {
    // Optional: try parsing memidx
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsememidx()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_28) {
    // Optional: try parsing memidx
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsememidx()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_28) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_29 = true;
    if (!this.consume('TOKEN_memory_2E_init')) { _ok_29 = false; }
      if (_ok_29) {
    if (!this.parsememidx()) { _ok_29 = false; }
      }
      if (_ok_29) {
    if (!this.parsedataidx()) { _ok_29 = false; }
      }
      if (_ok_29) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_30 = true;
    if (!this.consume('TOKEN_memory_2E_init')) { _ok_30 = false; }
      if (_ok_30) {
    if (!this.parsedataidx()) { _ok_30 = false; }
      }
      if (_ok_30) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_31 = true;
    if (!this.consume('TOKEN_data_2E_drop')) { _ok_31 = false; }
      if (_ok_31) {
    if (!this.parsedataidx()) { _ok_31 = false; }
      }
      if (_ok_31) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_32 = true;
    if (!this.consume('TOKEN_ref_2E_null')) { _ok_32 = false; }
      if (_ok_32) {
    if (!this.parseheaptype()) { _ok_32 = false; }
      }
      if (_ok_32) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_33 = true;
    if (!this.consume('TOKEN_ref_2E_func')) { _ok_33 = false; }
      if (_ok_33) {
    if (!this.parsefuncidx()) { _ok_33 = false; }
      }
      if (_ok_33) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_34 = true;
    if (!this.consume('TOKEN_ref_2E_is_5F_null')) { _ok_34 = false; }
      if (_ok_34) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_35 = true;
    if (!this.consume('TOKEN_ref_2E_as_5F_non_5F_null')) { _ok_35 = false; }
      if (_ok_35) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_36 = true;
    if (!this.consume('TOKEN_ref_2E_eq')) { _ok_36 = false; }
      if (_ok_36) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_37 = true;
    if (!this.consume('TOKEN_ref_2E_test')) { _ok_37 = false; }
      if (_ok_37) {
    if (!this.parsereftype()) { _ok_37 = false; }
      }
      if (_ok_37) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_38 = true;
    if (!this.consume('TOKEN_ref_2E_cast')) { _ok_38 = false; }
      if (_ok_38) {
    if (!this.parsereftype()) { _ok_38 = false; }
      }
      if (_ok_38) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_39 = true;
    if (!this.consume('TOKEN_struct_2E_new')) { _ok_39 = false; }
      if (_ok_39) {
    if (!this.parsetypeidx()) { _ok_39 = false; }
      }
      if (_ok_39) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_40 = true;
    if (!this.consume('TOKEN_struct_2E_new_5F_default')) { _ok_40 = false; }
      if (_ok_40) {
    if (!this.parsetypeidx()) { _ok_40 = false; }
      }
      if (_ok_40) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_41 = true;
    if (!this.consume('TOKEN_struct_2E_get')) { _ok_41 = false; }
      if (_ok_41) {
    if (!this.parsetypeidx()) { _ok_41 = false; }
      }
      if (_ok_41) {
    if (!this.parsefieldidx()) { _ok_41 = false; }
      }
      if (_ok_41) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_42 = true;
    if (!this.consume('TOKEN_struct_2E_get_5F_s')) { _ok_42 = false; }
      if (_ok_42) {
    if (!this.parsetypeidx()) { _ok_42 = false; }
      }
      if (_ok_42) {
    if (!this.parsefieldidx()) { _ok_42 = false; }
      }
      if (_ok_42) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_43 = true;
    if (!this.consume('TOKEN_struct_2E_get_5F_u')) { _ok_43 = false; }
      if (_ok_43) {
    if (!this.parsetypeidx()) { _ok_43 = false; }
      }
      if (_ok_43) {
    if (!this.parsefieldidx()) { _ok_43 = false; }
      }
      if (_ok_43) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_44 = true;
    if (!this.consume('TOKEN_struct_2E_set')) { _ok_44 = false; }
      if (_ok_44) {
    if (!this.parsetypeidx()) { _ok_44 = false; }
      }
      if (_ok_44) {
    if (!this.parsefieldidx()) { _ok_44 = false; }
      }
      if (_ok_44) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_45 = true;
    if (!this.consume('TOKEN_array_2E_new')) { _ok_45 = false; }
      if (_ok_45) {
    if (!this.parsetypeidx()) { _ok_45 = false; }
      }
      if (_ok_45) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_46 = true;
    if (!this.consume('TOKEN_array_2E_new_5F_default')) { _ok_46 = false; }
      if (_ok_46) {
    if (!this.parsetypeidx()) { _ok_46 = false; }
      }
      if (_ok_46) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_47 = true;
    if (!this.consume('TOKEN_array_2E_new_5F_fixed')) { _ok_47 = false; }
      if (_ok_47) {
    if (!this.parsetypeidx()) { _ok_47 = false; }
      }
      if (_ok_47) {
    if (!this.consume('nat')) { _ok_47 = false; }
      }
      if (_ok_47) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_48 = true;
    if (!this.consume('TOKEN_array_2E_new_5F_data')) { _ok_48 = false; }
      if (_ok_48) {
    if (!this.parsetypeidx()) { _ok_48 = false; }
      }
      if (_ok_48) {
    if (!this.parsedataidx()) { _ok_48 = false; }
      }
      if (_ok_48) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_49 = true;
    if (!this.consume('TOKEN_array_2E_new_5F_elem')) { _ok_49 = false; }
      if (_ok_49) {
    if (!this.parsetypeidx()) { _ok_49 = false; }
      }
      if (_ok_49) {
    if (!this.parseelemidx()) { _ok_49 = false; }
      }
      if (_ok_49) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_50 = true;
    if (!this.consume('TOKEN_array_2E_get')) { _ok_50 = false; }
      if (_ok_50) {
    if (!this.parsetypeidx()) { _ok_50 = false; }
      }
      if (_ok_50) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_51 = true;
    if (!this.consume('TOKEN_array_2E_get_5F_s')) { _ok_51 = false; }
      if (_ok_51) {
    if (!this.parsetypeidx()) { _ok_51 = false; }
      }
      if (_ok_51) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_52 = true;
    if (!this.consume('TOKEN_array_2E_get_5F_u')) { _ok_52 = false; }
      if (_ok_52) {
    if (!this.parsetypeidx()) { _ok_52 = false; }
      }
      if (_ok_52) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_53 = true;
    if (!this.consume('TOKEN_array_2E_set')) { _ok_53 = false; }
      if (_ok_53) {
    if (!this.parsetypeidx()) { _ok_53 = false; }
      }
      if (_ok_53) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_54 = true;
    if (!this.consume('TOKEN_array_2E_len')) { _ok_54 = false; }
      if (_ok_54) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_55 = true;
    if (!this.consume('TOKEN_array_2E_fill')) { _ok_55 = false; }
      if (_ok_55) {
    if (!this.parsetypeidx()) { _ok_55 = false; }
      }
      if (_ok_55) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_56 = true;
    if (!this.consume('TOKEN_array_2E_copy')) { _ok_56 = false; }
      if (_ok_56) {
    if (!this.parsetypeidx()) { _ok_56 = false; }
      }
      if (_ok_56) {
    if (!this.parsetypeidx()) { _ok_56 = false; }
      }
      if (_ok_56) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_57 = true;
    if (!this.consume('TOKEN_array_2E_init_5F_data')) { _ok_57 = false; }
      if (_ok_57) {
    if (!this.parsetypeidx()) { _ok_57 = false; }
      }
      if (_ok_57) {
    if (!this.parsedataidx()) { _ok_57 = false; }
      }
      if (_ok_57) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_58 = true;
    if (!this.consume('TOKEN_array_2E_init_5F_elem')) { _ok_58 = false; }
      if (_ok_58) {
    if (!this.parsetypeidx()) { _ok_58 = false; }
      }
      if (_ok_58) {
    if (!this.parseelemidx()) { _ok_58 = false; }
      }
      if (_ok_58) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_59 = true;
    if (!this.consume('TOKEN_ref_2E_i31')) { _ok_59 = false; }
      if (_ok_59) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_60 = true;
    if (!this.consume('TOKEN_i31_2E_get_5F_s')) { _ok_60 = false; }
      if (_ok_60) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_61 = true;
    if (!this.consume('TOKEN_i31_2E_get_5F_u')) { _ok_61 = false; }
      if (_ok_61) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_62 = true;
    if (!this.consume('TOKEN_any_2E_convert_5F_extern')) { _ok_62 = false; }
      if (_ok_62) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_63 = true;
    if (!this.consume('TOKEN_extern_2E_convert_5F_any')) { _ok_63 = false; }
      if (_ok_63) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_64 = true;
    if (!this.consume('TOKEN_call')) { _ok_64 = false; }
      if (_ok_64) {
    if (!this.parsefuncidx()) { _ok_64 = false; }
      }
      if (_ok_64) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_65 = true;
    if (!this.consume('TOKEN_call_5F_ref')) { _ok_65 = false; }
      if (_ok_65) {
    if (!this.parsetypeidx()) { _ok_65 = false; }
      }
      if (_ok_65) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_66 = true;
    if (!this.consume('TOKEN_call_5F_indirect')) { _ok_66 = false; }
      if (_ok_66) {
    // Optional: try parsing tableidx
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsetableidx()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_66) {
    if (!this.parsetypeuse()) { _ok_66 = false; }
      }
      if (_ok_66) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_67 = true;
    if (!this.consume('TOKEN_return_5F_call')) { _ok_67 = false; }
      if (_ok_67) {
    if (!this.parsefuncidx()) { _ok_67 = false; }
      }
      if (_ok_67) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_68 = true;
    if (!this.consume('TOKEN_return_5F_call_5F_ref')) { _ok_68 = false; }
      if (_ok_68) {
    if (!this.parsetypeidx()) { _ok_68 = false; }
      }
      if (_ok_68) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_69 = true;
    if (!this.consume('TOKEN_return_5F_call_5F_indirect')) { _ok_69 = false; }
      if (_ok_69) {
    // Optional: try parsing tableidx
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsetableidx()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_69) {
    if (!this.parsetypeuse()) { _ok_69 = false; }
      }
      if (_ok_69) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_70 = true;
    if (!this.consume('TOKEN_br')) { _ok_70 = false; }
      if (_ok_70) {
    if (!this.parselabelidx()) { _ok_70 = false; }
      }
      if (_ok_70) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_71 = true;
    if (!this.consume('TOKEN_br_5F_if')) { _ok_71 = false; }
      if (_ok_71) {
    if (!this.parselabelidx()) { _ok_71 = false; }
      }
      if (_ok_71) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_72 = true;
    if (!this.consume('TOKEN_br_5F_table')) { _ok_72 = false; }
      if (_ok_72) {
    {
      let count = 0;
      while (true) {
        const savePos = this.position;
        const saveMark = this.markEventState();
        if (!this.parselabelidx()) {
          this.position = savePos;
          this.restoreEventState(saveMark);
          break;
        }
        if (this.position === savePos) break;
        count++;
      }
      if (count === 0) {
        _ok_72 = false;
      }
    }
      }
      if (_ok_72) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_73 = true;
    if (!this.consume('TOKEN_br_5F_on_5F_null')) { _ok_73 = false; }
      if (_ok_73) {
    if (!this.parselabelidx()) { _ok_73 = false; }
      }
      if (_ok_73) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_74 = true;
    if (!this.consume('TOKEN_br_5F_on_5F_non_5F_null')) { _ok_74 = false; }
      if (_ok_74) {
    if (!this.parselabelidx()) { _ok_74 = false; }
      }
      if (_ok_74) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_75 = true;
    if (!this.consume('TOKEN_br_5F_on_5F_cast')) { _ok_75 = false; }
      if (_ok_75) {
    if (!this.parselabelidx()) { _ok_75 = false; }
      }
      if (_ok_75) {
    if (!this.parsereftype()) { _ok_75 = false; }
      }
      if (_ok_75) {
    if (!this.parsereftype()) { _ok_75 = false; }
      }
      if (_ok_75) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_76 = true;
    if (!this.consume('TOKEN_br_5F_on_5F_cast_5F_fail')) { _ok_76 = false; }
      if (_ok_76) {
    if (!this.parselabelidx()) { _ok_76 = false; }
      }
      if (_ok_76) {
    if (!this.parsereftype()) { _ok_76 = false; }
      }
      if (_ok_76) {
    if (!this.parsereftype()) { _ok_76 = false; }
      }
      if (_ok_76) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_77 = true;
    if (!this.consume('TOKEN_throw')) { _ok_77 = false; }
      if (_ok_77) {
    if (!this.parsetagidx()) { _ok_77 = false; }
      }
      if (_ok_77) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_78 = true;
    if (!this.consume('TOKEN_rethrow')) { _ok_78 = false; }
      if (_ok_78) {
    if (!this.parselabelidx()) { _ok_78 = false; }
      }
      if (_ok_78) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsenumericLikeInstr() {
    const __memoStart = this.position;
    const __memoKey = 'numericLikeInstr@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('numericLikeInstr', this.position);
    }
    const __ok = this._parsenumericLikeInstrBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('numericLikeInstr', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('numericLikeInstr', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsenumericLikeInstrBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('dottedName')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.parsememarg()) { _ok_1 = false; }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('dottedName')) { _ok_2 = false; }
      if (_ok_2) {
    if (!this.consume('float')) { _ok_2 = false; }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.consume('dottedName')) { _ok_3 = false; }
      if (_ok_3) {
    if (!this.consume('integer')) { _ok_3 = false; }
      }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_4 = true;
    if (!this.consume('dottedName')) { _ok_4 = false; }
      if (_ok_4) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsefloatConstInstr() {
    const __memoStart = this.position;
    const __memoKey = 'floatConstInstr@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('floatConstInstr', this.position);
    }
    const __ok = this._parsefloatConstInstrBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('floatConstInstr', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('floatConstInstr', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsefloatConstInstrBody() {
    // Group
    {
      let _matchedAlt = false;
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        let _ok_1 = true;
    if (!this.consume('TOKEN_f32_2E_const')) { _ok_1 = false; }
        if (_ok_1) {
          _matchedAlt = true;
        } else {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) {
        const _altStart = this.position;
        const _altMark = this.markEventState();
        let _ok_2 = true;
    if (!this.consume('TOKEN_f64_2E_const')) { _ok_2 = false; }
        if (_ok_2) {
          _matchedAlt = true;
        } else {
          this.position = _altStart;
          this.restoreEventState(_altMark);
        }
      }
      if (!_matchedAlt) { return false; }
    }
    if (!this.parsefloatValue()) { return false; }

    return true;
  }
  parsefloatValue() {
    const __memoStart = this.position;
    const __memoKey = 'floatValue@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('floatValue', this.position);
    }
    const __ok = this._parsefloatValueBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('floatValue', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('floatValue', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsefloatValueBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('float')) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('integer')) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (this.match('sign')) { /* optional token matched */ }
      if (_ok_3) {
    if (!this.consume('nat')) { _ok_3 = false; }
      }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsememLikeInstr() {
    const __memoStart = this.position;
    const __memoKey = 'memLikeInstr@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('memLikeInstr', this.position);
    }
    const __ok = this._parsememLikeInstrBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('memLikeInstr', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('memLikeInstr', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsememLikeInstrBody() {
    if (!this.consume('dottedName')) { return false; }
    // Optional: try parsing memarg
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsememarg()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }

    return true;
  }
  parsememoryAccessInstr() {
    const __memoStart = this.position;
    const __memoKey = 'memoryAccessInstr@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('memoryAccessInstr', this.position);
    }
    const __ok = this._parsememoryAccessInstrBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('memoryAccessInstr', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('memoryAccessInstr', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsememoryAccessInstrBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.parsememoryOpcode()) { _ok_1 = false; }
      if (_ok_1) {
    // Optional: try parsing memidx
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsememidx()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_1) {
    // Optional: try parsing memarg
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsememarg()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.parsememoryLaneOpcode()) { _ok_2 = false; }
      if (_ok_2) {
    if (!this.parsememidx()) { _ok_2 = false; }
      }
      if (_ok_2) {
    // Optional: try parsing memarg
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsememarg()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_2) {
    if (!this.parselaneidx()) { _ok_2 = false; }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.parsememoryLaneOpcode()) { _ok_3 = false; }
      if (_ok_3) {
    // Optional: try parsing memarg
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parsememarg()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
      }
      if (_ok_3) {
    if (!this.parselaneidx()) { _ok_3 = false; }
      }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsememoryOpcode() {
    const __memoStart = this.position;
    const __memoKey = 'memoryOpcode@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('memoryOpcode', this.position);
    }
    const __ok = this._parsememoryOpcodeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('memoryOpcode', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('memoryOpcode', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsememoryOpcodeBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN_i32_2E_load')) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN_i64_2E_load')) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.consume('TOKEN_f32_2E_load')) { _ok_3 = false; }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_4 = true;
    if (!this.consume('TOKEN_f64_2E_load')) { _ok_4 = false; }
      if (_ok_4) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_5 = true;
    if (!this.consume('TOKEN_i32_2E_load8_5F_s')) { _ok_5 = false; }
      if (_ok_5) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_6 = true;
    if (!this.consume('TOKEN_i32_2E_load8_5F_u')) { _ok_6 = false; }
      if (_ok_6) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_7 = true;
    if (!this.consume('TOKEN_i32_2E_load16_5F_s')) { _ok_7 = false; }
      if (_ok_7) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_8 = true;
    if (!this.consume('TOKEN_i32_2E_load16_5F_u')) { _ok_8 = false; }
      if (_ok_8) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_9 = true;
    if (!this.consume('TOKEN_i64_2E_load8_5F_s')) { _ok_9 = false; }
      if (_ok_9) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_10 = true;
    if (!this.consume('TOKEN_i64_2E_load8_5F_u')) { _ok_10 = false; }
      if (_ok_10) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_11 = true;
    if (!this.consume('TOKEN_i64_2E_load16_5F_s')) { _ok_11 = false; }
      if (_ok_11) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_12 = true;
    if (!this.consume('TOKEN_i64_2E_load16_5F_u')) { _ok_12 = false; }
      if (_ok_12) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_13 = true;
    if (!this.consume('TOKEN_i64_2E_load32_5F_s')) { _ok_13 = false; }
      if (_ok_13) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_14 = true;
    if (!this.consume('TOKEN_i64_2E_load32_5F_u')) { _ok_14 = false; }
      if (_ok_14) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_15 = true;
    if (!this.consume('TOKEN_i32_2E_store')) { _ok_15 = false; }
      if (_ok_15) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_16 = true;
    if (!this.consume('TOKEN_i64_2E_store')) { _ok_16 = false; }
      if (_ok_16) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_17 = true;
    if (!this.consume('TOKEN_f32_2E_store')) { _ok_17 = false; }
      if (_ok_17) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_18 = true;
    if (!this.consume('TOKEN_f64_2E_store')) { _ok_18 = false; }
      if (_ok_18) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_19 = true;
    if (!this.consume('TOKEN_i32_2E_store8')) { _ok_19 = false; }
      if (_ok_19) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_20 = true;
    if (!this.consume('TOKEN_i32_2E_store16')) { _ok_20 = false; }
      if (_ok_20) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_21 = true;
    if (!this.consume('TOKEN_i64_2E_store8')) { _ok_21 = false; }
      if (_ok_21) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_22 = true;
    if (!this.consume('TOKEN_i64_2E_store16')) { _ok_22 = false; }
      if (_ok_22) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_23 = true;
    if (!this.consume('TOKEN_i64_2E_store32')) { _ok_23 = false; }
      if (_ok_23) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_24 = true;
    if (!this.consume('TOKEN_v128_2E_load')) { _ok_24 = false; }
      if (_ok_24) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_25 = true;
    if (!this.consume('TOKEN_v128_2E_store')) { _ok_25 = false; }
      if (_ok_25) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_26 = true;
    if (!this.consume('TOKEN_v128_2E_load8x8_5F_s')) { _ok_26 = false; }
      if (_ok_26) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_27 = true;
    if (!this.consume('TOKEN_v128_2E_load8x8_5F_u')) { _ok_27 = false; }
      if (_ok_27) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_28 = true;
    if (!this.consume('TOKEN_v128_2E_load16x4_5F_s')) { _ok_28 = false; }
      if (_ok_28) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_29 = true;
    if (!this.consume('TOKEN_v128_2E_load16x4_5F_u')) { _ok_29 = false; }
      if (_ok_29) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_30 = true;
    if (!this.consume('TOKEN_v128_2E_load32x2_5F_s')) { _ok_30 = false; }
      if (_ok_30) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_31 = true;
    if (!this.consume('TOKEN_v128_2E_load32x2_5F_u')) { _ok_31 = false; }
      if (_ok_31) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_32 = true;
    if (!this.consume('TOKEN_v128_2E_load8_5F_splat')) { _ok_32 = false; }
      if (_ok_32) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_33 = true;
    if (!this.consume('TOKEN_v128_2E_load16_5F_splat')) { _ok_33 = false; }
      if (_ok_33) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_34 = true;
    if (!this.consume('TOKEN_v128_2E_load32_5F_splat')) { _ok_34 = false; }
      if (_ok_34) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_35 = true;
    if (!this.consume('TOKEN_v128_2E_load64_5F_splat')) { _ok_35 = false; }
      if (_ok_35) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_36 = true;
    if (!this.consume('TOKEN_v128_2E_load32_5F_zero')) { _ok_36 = false; }
      if (_ok_36) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_37 = true;
    if (!this.consume('TOKEN_v128_2E_load64_5F_zero')) { _ok_37 = false; }
      if (_ok_37) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsememoryLaneOpcode() {
    const __memoStart = this.position;
    const __memoKey = 'memoryLaneOpcode@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('memoryLaneOpcode', this.position);
    }
    const __ok = this._parsememoryLaneOpcodeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('memoryLaneOpcode', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('memoryLaneOpcode', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsememoryLaneOpcodeBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN_v128_2E_load8_5F_lane')) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN_v128_2E_load16_5F_lane')) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.consume('TOKEN_v128_2E_load32_5F_lane')) { _ok_3 = false; }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_4 = true;
    if (!this.consume('TOKEN_v128_2E_load64_5F_lane')) { _ok_4 = false; }
      if (_ok_4) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_5 = true;
    if (!this.consume('TOKEN_v128_2E_store8_5F_lane')) { _ok_5 = false; }
      if (_ok_5) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_6 = true;
    if (!this.consume('TOKEN_v128_2E_store16_5F_lane')) { _ok_6 = false; }
      if (_ok_6) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_7 = true;
    if (!this.consume('TOKEN_v128_2E_store32_5F_lane')) { _ok_7 = false; }
      if (_ok_7) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_8 = true;
    if (!this.consume('TOKEN_v128_2E_store64_5F_lane')) { _ok_8 = false; }
      if (_ok_8) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsesimdLikeInstr() {
    const __memoStart = this.position;
    const __memoKey = 'simdLikeInstr@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('simdLikeInstr', this.position);
    }
    const __ok = this._parsesimdLikeInstrBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('simdLikeInstr', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('simdLikeInstr', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsesimdLikeInstrBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN_v128_2E_const')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.parsesimdConst()) { _ok_1 = false; }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('dottedName')) { _ok_2 = false; }
      if (_ok_2) {
    if (!this.parselaneidx()) { _ok_2 = false; }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.consume('TOKEN_i8x16_2E_shuffle')) { _ok_3 = false; }
      if (_ok_3) {
    if (!this.parselaneidx()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parselaneidx()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parselaneidx()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parselaneidx()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parselaneidx()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parselaneidx()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parselaneidx()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parselaneidx()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parselaneidx()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parselaneidx()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parselaneidx()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parselaneidx()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parselaneidx()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parselaneidx()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parselaneidx()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parselaneidx()) { _ok_3 = false; }
      }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parseblockType() {
    const __memoStart = this.position;
    const __memoKey = 'blockType@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('blockType', this.position);
    }
    const __ok = this._parseblockTypeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('blockType', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('blockType', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseblockTypeBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.parsetypeuse()) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.parseresultTypes()) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.parsevalueType()) { _ok_3 = false; }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parselabel() {
    const __memoStart = this.position;
    const __memoKey = 'label@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('label', this.position);
    }
    const __ok = this._parselabelBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('label', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('label', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parselabelBody() {
    if (!this.parseid()) { return false; }

    return true;
  }
  parsesimdConst() {
    const __memoStart = this.position;
    const __memoKey = 'simdConst@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('simdConst', this.position);
    }
    const __ok = this._parsesimdConstBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('simdConst', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('simdConst', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsesimdConstBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN_i8x16')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.parsesignedNat()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsesignedNat()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsesignedNat()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsesignedNat()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsesignedNat()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsesignedNat()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsesignedNat()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsesignedNat()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsesignedNat()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsesignedNat()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsesignedNat()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsesignedNat()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsesignedNat()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsesignedNat()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsesignedNat()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsesignedNat()) { _ok_1 = false; }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN_i16x8')) { _ok_2 = false; }
      if (_ok_2) {
    if (!this.parsesignedNat()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.parsesignedNat()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.parsesignedNat()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.parsesignedNat()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.parsesignedNat()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.parsesignedNat()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.parsesignedNat()) { _ok_2 = false; }
      }
      if (_ok_2) {
    if (!this.parsesignedNat()) { _ok_2 = false; }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.consume('TOKEN_i32x4')) { _ok_3 = false; }
      if (_ok_3) {
    if (!this.parsesignedNat()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parsesignedNat()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parsesignedNat()) { _ok_3 = false; }
      }
      if (_ok_3) {
    if (!this.parsesignedNat()) { _ok_3 = false; }
      }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_4 = true;
    if (!this.consume('TOKEN_i64x2')) { _ok_4 = false; }
      if (_ok_4) {
    if (!this.parsesignedNat()) { _ok_4 = false; }
      }
      if (_ok_4) {
    if (!this.parsesignedNat()) { _ok_4 = false; }
      }
      if (_ok_4) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_5 = true;
    if (!this.consume('TOKEN_f32x4')) { _ok_5 = false; }
      if (_ok_5) {
    if (!this.parsefloatValue()) { _ok_5 = false; }
      }
      if (_ok_5) {
    if (!this.parsefloatValue()) { _ok_5 = false; }
      }
      if (_ok_5) {
    if (!this.parsefloatValue()) { _ok_5 = false; }
      }
      if (_ok_5) {
    if (!this.parsefloatValue()) { _ok_5 = false; }
      }
      if (_ok_5) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_6 = true;
    if (!this.consume('TOKEN_f64x2')) { _ok_6 = false; }
      if (_ok_6) {
    if (!this.parsefloatValue()) { _ok_6 = false; }
      }
      if (_ok_6) {
    if (!this.parsefloatValue()) { _ok_6 = false; }
      }
      if (_ok_6) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsetypeuse() {
    const __memoStart = this.position;
    const __memoKey = 'typeuse@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('typeuse', this.position);
    }
    const __ok = this._parsetypeuseBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('typeuse', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('typeuse', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsetypeuseBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN__28_')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.consume('TOKEN_type')) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.parsetypeidx()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.consume('TOKEN__29_')) { _ok_1 = false; }
      }
      if (_ok_1) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseparamDecl()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_1) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseresultDecl()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    {
      let count = 0;
      while (true) {
        const savePos = this.position;
        const saveMark = this.markEventState();
        if (!this.parseparamDecl()) {
          this.position = savePos;
          this.restoreEventState(saveMark);
          break;
        }
        if (this.position === savePos) break;
        count++;
      }
      if (count === 0) {
        _ok_2 = false;
      }
    }
      if (_ok_2) {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseresultDecl()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    {
      let count = 0;
      while (true) {
        const savePos = this.position;
        const saveMark = this.markEventState();
        if (!this.parseresultDecl()) {
          this.position = savePos;
          this.restoreEventState(saveMark);
          break;
        }
        if (this.position === savePos) break;
        count++;
      }
      if (count === 0) {
        _ok_3 = false;
      }
    }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parseparamDecl() {
    const __memoStart = this.position;
    const __memoKey = 'paramDecl@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('paramDecl', this.position);
    }
    const __ok = this._parseparamDeclBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('paramDecl', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('paramDecl', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseparamDeclBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_param')) { return false; }
    // Optional: try parsing id
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseid()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    {
      let count = 0;
      while (true) {
        const savePos = this.position;
        const saveMark = this.markEventState();
        if (!this.parsevalueType()) {
          this.position = savePos;
          this.restoreEventState(saveMark);
          break;
        }
        if (this.position === savePos) break;
        count++;
      }
      if (count === 0) {
        return false;
      }
    }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parseresultDecl() {
    const __memoStart = this.position;
    const __memoKey = 'resultDecl@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('resultDecl', this.position);
    }
    const __ok = this._parseresultDeclBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('resultDecl', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('resultDecl', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseresultDeclBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_result')) { return false; }
    {
      let count = 0;
      while (true) {
        const savePos = this.position;
        const saveMark = this.markEventState();
        if (!this.parsevalueType()) {
          this.position = savePos;
          this.restoreEventState(saveMark);
          break;
        }
        if (this.position === savePos) break;
        count++;
      }
      if (count === 0) {
        return false;
      }
    }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parseresultTypes() {
    const __memoStart = this.position;
    const __memoKey = 'resultTypes@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('resultTypes', this.position);
    }
    const __ok = this._parseresultTypesBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('resultTypes', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('resultTypes', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseresultTypesBody() {
    if (!this.consume('TOKEN__28_')) { return false; }
    if (!this.consume('TOKEN_result')) { return false; }
    {
      let count = 0;
      while (true) {
        const savePos = this.position;
        const saveMark = this.markEventState();
        if (!this.parsevalueType()) {
          this.position = savePos;
          this.restoreEventState(saveMark);
          break;
        }
        if (this.position === savePos) break;
        count++;
      }
      if (count === 0) {
        return false;
      }
    }
    if (!this.consume('TOKEN__29_')) { return false; }

    return true;
  }
  parseheaptype() {
    const __memoStart = this.position;
    const __memoKey = 'heaptype@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('heaptype', this.position);
    }
    const __ok = this._parseheaptypeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('heaptype', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('heaptype', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseheaptypeBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN_any')) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN_eq')) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.consume('TOKEN_i31')) { _ok_3 = false; }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_4 = true;
    if (!this.consume('TOKEN_struct')) { _ok_4 = false; }
      if (_ok_4) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_5 = true;
    if (!this.consume('TOKEN_array')) { _ok_5 = false; }
      if (_ok_5) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_6 = true;
    if (!this.consume('TOKEN_none')) { _ok_6 = false; }
      if (_ok_6) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_7 = true;
    if (!this.consume('TOKEN_func')) { _ok_7 = false; }
      if (_ok_7) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_8 = true;
    if (!this.consume('TOKEN_nofunc')) { _ok_8 = false; }
      if (_ok_8) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_9 = true;
    if (!this.consume('TOKEN_exn')) { _ok_9 = false; }
      if (_ok_9) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_10 = true;
    if (!this.consume('TOKEN_noexn')) { _ok_10 = false; }
      if (_ok_10) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_11 = true;
    if (!this.consume('TOKEN_extern')) { _ok_11 = false; }
      if (_ok_11) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_12 = true;
    if (!this.consume('TOKEN_noextern')) { _ok_12 = false; }
      if (_ok_12) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_13 = true;
    if (!this.consume('TOKEN_funcref')) { _ok_13 = false; }
      if (_ok_13) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_14 = true;
    if (!this.consume('TOKEN_externref')) { _ok_14 = false; }
      if (_ok_14) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_15 = true;
    if (!this.consume('TOKEN_exnref')) { _ok_15 = false; }
      if (_ok_15) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_16 = true;
    if (!this.parsetypeidx()) { _ok_16 = false; }
      if (_ok_16) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsereftype() {
    const __memoStart = this.position;
    const __memoKey = 'reftype@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('reftype', this.position);
    }
    const __ok = this._parsereftypeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('reftype', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('reftype', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsereftypeBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN__28_')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.consume('TOKEN_ref')) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (this.match('TOKEN_null')) { /* optional matched */ }
      }
      if (_ok_1) {
    if (!this.parseheaptype()) { _ok_1 = false; }
      }
      if (_ok_1) {
    if (!this.consume('TOKEN__29_')) { _ok_1 = false; }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN_funcref')) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.consume('TOKEN_externref')) { _ok_3 = false; }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_4 = true;
    if (!this.consume('TOKEN_exnref')) { _ok_4 = false; }
      if (_ok_4) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsevalueType() {
    const __memoStart = this.position;
    const __memoKey = 'valueType@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('valueType', this.position);
    }
    const __ok = this._parsevalueTypeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('valueType', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('valueType', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsevalueTypeBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN_i32')) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN_i64')) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.consume('TOKEN_f32')) { _ok_3 = false; }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_4 = true;
    if (!this.consume('TOKEN_f64')) { _ok_4 = false; }
      if (_ok_4) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_5 = true;
    if (!this.consume('TOKEN_v128')) { _ok_5 = false; }
      if (_ok_5) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_6 = true;
    if (!this.parsereftype()) { _ok_6 = false; }
      if (_ok_6) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parseid() {
    const __memoStart = this.position;
    const __memoKey = 'id@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('id', this.position);
    }
    const __ok = this._parseidBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('id', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('id', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseidBody() {
    if (!this.consumeContextual('identifier')) { return false; }

    return true;
  }
  parseindex() {
    const __memoStart = this.position;
    const __memoKey = 'index@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('index', this.position);
    }
    const __ok = this._parseindexBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('index', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('index', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseindexBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.parseid()) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('nat')) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsetypeidx() {
    const __memoStart = this.position;
    const __memoKey = 'typeidx@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('typeidx', this.position);
    }
    const __ok = this._parsetypeidxBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('typeidx', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('typeidx', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsetypeidxBody() {
    if (!this.parseindex()) { return false; }

    return true;
  }
  parsefuncidx() {
    const __memoStart = this.position;
    const __memoKey = 'funcidx@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('funcidx', this.position);
    }
    const __ok = this._parsefuncidxBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('funcidx', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('funcidx', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsefuncidxBody() {
    if (!this.parseindex()) { return false; }

    return true;
  }
  parsetableidx() {
    const __memoStart = this.position;
    const __memoKey = 'tableidx@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('tableidx', this.position);
    }
    const __ok = this._parsetableidxBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('tableidx', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('tableidx', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsetableidxBody() {
    if (!this.parseindex()) { return false; }

    return true;
  }
  parsememidx() {
    const __memoStart = this.position;
    const __memoKey = 'memidx@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('memidx', this.position);
    }
    const __ok = this._parsememidxBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('memidx', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('memidx', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsememidxBody() {
    if (!this.parseindex()) { return false; }

    return true;
  }
  parsetagidx() {
    const __memoStart = this.position;
    const __memoKey = 'tagidx@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('tagidx', this.position);
    }
    const __ok = this._parsetagidxBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('tagidx', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('tagidx', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsetagidxBody() {
    if (!this.parseindex()) { return false; }

    return true;
  }
  parseelemidx() {
    const __memoStart = this.position;
    const __memoKey = 'elemidx@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('elemidx', this.position);
    }
    const __ok = this._parseelemidxBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('elemidx', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('elemidx', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseelemidxBody() {
    if (!this.parseindex()) { return false; }

    return true;
  }
  parsedataidx() {
    const __memoStart = this.position;
    const __memoKey = 'dataidx@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('dataidx', this.position);
    }
    const __ok = this._parsedataidxBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('dataidx', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('dataidx', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsedataidxBody() {
    if (!this.parseindex()) { return false; }

    return true;
  }
  parselabelidx() {
    const __memoStart = this.position;
    const __memoKey = 'labelidx@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('labelidx', this.position);
    }
    const __ok = this._parselabelidxBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('labelidx', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('labelidx', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parselabelidxBody() {
    if (!this.parseindex()) { return false; }

    return true;
  }
  parsefieldidx() {
    const __memoStart = this.position;
    const __memoKey = 'fieldidx@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('fieldidx', this.position);
    }
    const __ok = this._parsefieldidxBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('fieldidx', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('fieldidx', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsefieldidxBody() {
    if (!this.parseindex()) { return false; }

    return true;
  }
  parsesignedNat() {
    const __memoStart = this.position;
    const __memoKey = 'signedNat@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('signedNat', this.position);
    }
    const __ok = this._parsesignedNatBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('signedNat', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('signedNat', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsesignedNatBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('integer')) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (this.match('sign')) { /* optional token matched */ }
      if (_ok_2) {
    if (!this.consume('nat')) { _ok_2 = false; }
      }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsent() {
    const __memoStart = this.position;
    const __memoKey = 'nt@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('nt', this.position);
    }
    const __ok = this._parsentBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('nt', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('nt', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsentBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN_i32')) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN_i64')) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.consume('TOKEN_f32')) { _ok_3 = false; }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_4 = true;
    if (!this.consume('TOKEN_f64')) { _ok_4 = false; }
      if (_ok_4) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsesz() {
    const __memoStart = this.position;
    const __memoKey = 'sz@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('sz', this.position);
    }
    const __ok = this._parseszBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('sz', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('sz', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseszBody() {
    if (!this.consume('nat')) { return false; }

    return true;
  }
  parsesx() {
    const __memoStart = this.position;
    const __memoKey = 'sx@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('sx', this.position);
    }
    const __ok = this._parsesxBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('sx', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('sx', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsesxBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN__5F_s')) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN__5F_u')) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parselimits() {
    const __memoStart = this.position;
    const __memoKey = 'limits@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('limits', this.position);
    }
    const __ok = this._parselimitsBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('limits', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('limits', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parselimitsBody() {
    // Optional: try parsing addrtype
    {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseaddrtype()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
      }
    }
    if (!this.consume('nat')) { return false; }
    if (this.match('nat')) { /* optional token matched */ }

    return true;
  }
  parseaddrtype() {
    const __memoStart = this.position;
    const __memoKey = 'addrtype@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('addrtype', this.position);
    }
    const __ok = this._parseaddrtypeBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('addrtype', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('addrtype', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseaddrtypeBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN_i32')) { _ok_1 = false; }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN_i64')) { _ok_2 = false; }
      if (_ok_2) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parsememarg() {
    const __memoStart = this.position;
    const __memoKey = 'memarg@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('memarg', this.position);
    }
    const __ok = this._parsememargBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('memarg', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('memarg', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parsememargBody() {
    const _ruleStart = this.position;
    let _matched = false;
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_1 = true;
    if (!this.consume('TOKEN_offset_3D_')) { _ok_1 = false; }
      if (_ok_1) {
    if (!this.consume('nat')) { _ok_1 = false; }
      }
      if (_ok_1) {
    // Group ?
    {
      const _optStart = this.position;
      const _optMark = this.markEventState();
      let _ok_2 = true;
    if (!this.consume('TOKEN_align_3D_')) { _ok_2 = false; }
      if (_ok_2) {
    if (!this.consume('nat')) { _ok_2 = false; }
      }
      if (!_ok_2) {
        this.position = _optStart;
        this.restoreEventState(_optMark);
      }
    }
      }
      if (_ok_1) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_3 = true;
    if (!this.consume('TOKEN_align_3D_')) { _ok_3 = false; }
      if (_ok_3) {
    if (!this.consume('nat')) { _ok_3 = false; }
      }
      if (_ok_3) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_4 = true;
    if (!this.consume('TOKEN_offset_3D_')) { _ok_4 = false; }
      if (_ok_4) {
    if (!this.consume('nat')) { _ok_4 = false; }
      }
      if (_ok_4) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      const _ruleMark = this.markEventState();
      let _ok_5 = true;
    if (!this.consume('TOKEN_align_3D_')) { _ok_5 = false; }
      if (_ok_5) {
    if (!this.consume('nat')) { _ok_5 = false; }
      }
      if (_ok_5) {
        _matched = true;
      } else {
        this.position = _ruleStart;
        this.restoreEventState(_ruleMark);
      }
    }
    if (!_matched) {
      return false;
    }

    return true;
  }
  parselaneidx() {
    const __memoStart = this.position;
    const __memoKey = 'laneidx@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('laneidx', this.position);
    }
    const __ok = this._parselaneidxBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('laneidx', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('laneidx', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parselaneidxBody() {
    if (!this.consume('nat')) { return false; }

    return true;
  }
  parseexpr() {
    const __memoStart = this.position;
    const __memoKey = 'expr@' + __memoStart;
    if (this.failureMemo.has(__memoKey)) {
      return false;
    }
    if (this._canMemoSuccess) {
      const __memoHit = this.successMemo.get(__memoKey);
      if (__memoHit !== undefined) {
        this.position = __memoHit.endPos;
        if (this.eventHandler && __memoHit.node) {
          this.eventHandler.appendNode(__memoHit.node);
        }
        return true;
      }
    }
    if (this.eventHandler && typeof this.eventHandler.startNonterminal === 'function') {
      this.eventHandler.startNonterminal('expr', this.position);
    }
    const __ok = this._parseexprBody();
    if (!__ok) {
      if (this.failureMemo.size > 200000) {
        this.failureMemo.clear();
      }
      this.failureMemo.add(__memoKey);
    }
    if (this.eventHandler) {
      if (__ok && typeof this.eventHandler.endNonterminal === 'function') {
        this.eventHandler.endNonterminal('expr', this.position);
      }
      if (!__ok && typeof this.eventHandler.abortNonterminal === 'function') {
        this.eventHandler.abortNonterminal('expr', this.position);
      }
    }
    if (__ok && this._canMemoSuccess) {
      if (this.successMemo.size > 200000) {
        this.successMemo.clear();
      }
      this.successMemo.set(__memoKey, {
        endPos: this.position,
        node: this.eventHandler ? this.eventHandler.lastClosedNode : null
      });
    }
    return __ok;
  }

  _parseexprBody() {
    while (true) {
      const savePos = this.position;
      const saveMark = this.markEventState();
      if (!this.parseinstr()) {
        this.position = savePos;
        this.restoreEventState(saveMark);
        break;
      }
      if (this.position === savePos) break;
    }

    return true;
  }
}

module.exports = Parser;