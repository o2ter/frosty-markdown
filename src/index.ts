//
//  index.ts
//
//  The MIT License
//  Copyright (c) 2021 - 2026 O2ter Limited. All rights reserved.
//
//  Permission is hereby granted, free of charge, to any person obtaining a copy
//  of this software and associated documentation files (the "Software"), to deal
//  in the Software without restriction, including without limitation the rights
//  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//  copies of the Software, and to permit persons to whom the Software is
//  furnished to do so, subject to the following conditions:
//
//  The above copyright notice and this permission notice shall be included in
//  all copies or substantial portions of the Software.
//
//  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
//  THE SOFTWARE.
//

import { unreachable } from 'devlop';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { urlAttributes } from 'html-url-attributes';
import { Fragment, jsx, jsxs } from 'frosty/jsx-runtime';
import { ComponentNode, ElementNode, useMemo, useResource } from 'frosty';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified, Processor } from 'unified';
import { visit } from 'unist-util-visit';
import { VFile } from 'vfile';

import type { PluggableList } from 'unified';
import type { Root as MdastRoot } from 'mdast';
import type { Root } from 'hast';
import type { Options as RemarkRehypeOptions } from 'remark-rehype';
import type { BuildVisitor } from 'unist-util-visit';

type UrlTransform = (value: string, key: string, node: any) => string;

interface Options {
  children?: string;
  rehypePlugins?: PluggableList;
  remarkPlugins?: PluggableList;
  remarkRehypeOptions?: RemarkRehypeOptions;
  allowedElements?: string[];
  allowElement?: (node: any, index: number, parent: any) => boolean;
  components?: Record<string, any>;
  disallowedElements?: string[];
  skipHtml?: boolean;
  unwrapDisallowed?: boolean;
  urlTransform?: UrlTransform;
  fallback?: ElementNode;
}

interface HooksOptions extends Options {
  fallback?: ElementNode;
}

const emptyPlugins: PluggableList = [];
const emptyRemarkRehypeOptions: Readonly<RemarkRehypeOptions> = { allowDangerousHtml: true };
const safeProtocol = /^(https?|ircs?|mailto|xmpp)$/i;

export function Markdown(options: Readonly<Options>): ComponentNode {
  const processor = createProcessor(options);
  const file = createFile(options);
  return post(processor.runSync(processor.parse(file), file), options);
}

export function MarkdownAsync(options: Readonly<HooksOptions>): ElementNode {
  const processor = useMemo(
    () => createProcessor(options),
    [options.rehypePlugins, options.remarkPlugins, options.remarkRehypeOptions]
  );
  const { resource: tree, error } = useResource(() => {
    const file = createFile(options);
    return processor.run(processor.parse(file), file);
  }, [options.children, processor]);
  if (error) throw error;
  return tree ? post(tree, options) : options.fallback;
}


function createProcessor(options: Readonly<Options>): Processor<MdastRoot, MdastRoot, Root, undefined, undefined> {
  const rehypePlugins = options.rehypePlugins || emptyPlugins;
  const remarkPlugins = options.remarkPlugins || emptyPlugins;
  const remarkRehypeOptions = options.remarkRehypeOptions
    ? { ...options.remarkRehypeOptions, ...emptyRemarkRehypeOptions }
    : emptyRemarkRehypeOptions;

  const processor = unified()
    .use(remarkParse)
    .use(remarkPlugins)
    .use(remarkRehype, remarkRehypeOptions)
    .use(rehypePlugins);

  return processor;
}


function createFile(options: Readonly<Options>): VFile {
  const children = options.children || '';
  const file = new VFile();

  if (typeof children === 'string') {
    file.value = children;
  } else {
    unreachable(
      'Unexpected value `' +
      children +
      '` for `children` prop, expected `string`'
    );
  }

  return file;
}


function post(tree: any, options: Readonly<Options>): ComponentNode {
  const allowedElements = options.allowedElements;
  const allowElement = options.allowElement;
  const components = options.components;
  const disallowedElements = options.disallowedElements;
  const skipHtml = options.skipHtml;
  const unwrapDisallowed = options.unwrapDisallowed;
  const urlTransform = options.urlTransform || defaultUrlTransform;

  if (allowedElements && disallowedElements) {
    unreachable(
      'Unexpected combined `allowedElements` and `disallowedElements`, expected one or the other'
    );
  }

  visit(tree, transform as BuildVisitor<Root>);

  return toJsxRuntime(tree, {
    Fragment,
    components,
    ignoreInvalidStyle: true,
    jsx,
    jsxs,
    passKeys: true,
    passNode: true
  });

  function transform(node: any, index: number, parent: any) {
    if (node.type === 'raw' && parent && typeof index === 'number') {
      if (skipHtml) {
        parent.children.splice(index, 1);
      } else {
        parent.children[index] = { type: 'text', value: node.value };
      }

      return index;
    }

    if (node.type === 'element') {
      let key: string;

      for (key in urlAttributes) {
        if (
          Object.hasOwn(urlAttributes, key) &&
          Object.hasOwn(node.properties, key)
        ) {
          const value = node.properties[key];
          const test = urlAttributes[key];
          if (test === null || test.includes(node.tagName)) {
            node.properties[key] = urlTransform(String(value || ''), key, node);
          }
        }
      }
    }

    if (node.type === 'element') {
      let remove = allowedElements
        ? !allowedElements.includes(node.tagName)
        : disallowedElements
          ? disallowedElements.includes(node.tagName)
          : false;

      if (!remove && allowElement && typeof index === 'number') {
        remove = !allowElement(node, index, parent);
      }

      if (remove && parent && typeof index === 'number') {
        if (unwrapDisallowed && node.children) {
          parent.children.splice(index, 1, ...node.children);
        } else {
          parent.children.splice(index, 1);
        }

        return index;
      }
    }
  }
}


export function defaultUrlTransform(value: string): string {
  const colon = value.indexOf(':');
  const questionMark = value.indexOf('?');
  const numberSign = value.indexOf('#');
  const slash = value.indexOf('/');

  if (
    // If there is no protocol, it’s relative.
    colon === -1 ||
    // If the first colon is after a `?`, `#`, or `/`, it’s not a protocol.
    (slash !== -1 && colon > slash) ||
    (questionMark !== -1 && colon > questionMark) ||
    (numberSign !== -1 && colon > numberSign) ||
    // It is a protocol, it should be allowed.
    safeProtocol.test(value.slice(0, colon))
  ) {
    return value;
  }

  return '';
}