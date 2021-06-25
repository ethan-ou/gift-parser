import GIFTParser from "./GIFTParser";
import { GIFTParse, GIFTParseSection, GIFTSyntaxError } from "../types";

/**
 * Recursively finds errors in a section of the input
 * text. When an error is found, the token is escaped
 * with a backslash "\\". This replicates the error
 * recovery found on traditional LL(*) parsers.
 * @param message
 */
export default function handleErrors(
  parseArray: GIFTParseSection[],
  originalText: string,
  lineEnding: string
) {
  const EMPTYORSPACES = /^\s*$/g;
  const out = [];

  for (const item of parseArray) {
    const { location } = item;
    if (!location.text.match(EMPTYORSPACES)) {
      out.push(handleSingleError(item, originalText, lineEnding));
    }
  }

  return out;
}

export function handleSingleError(
  parse: GIFTParseSection,
  originalText: string,
  lineEnding: string
): GIFTParseSection {
  const [success, error] = parse.result;

  if (error === null) {
    return parse;
  }

  // GIFT Parser only returns a single error if the section of text
  // hasn't been processed yet. Since all errors are wrapped in an
  // array, checking for a single error is a good heuristic to
  // see whether more errors need to be found.
  const checkSingleErrorFound = error !== null && error.length === 1;

  return checkSingleErrorFound
    ? correctMessage(findErrors(parse), originalText, lineEnding)
    : parse;
}

// TODO: Change language used
function findErrors(message: GIFTParseSection): GIFTParseSection {
  const ITERATION_LIMIT = 50;
  const stack: string[] = [];
  const errors: GIFTSyntaxError[] = [];

  const { location, result } = message;
  const [success, error] = result;

  if (error === null) {
    return message;
  }

  stack.push(location.text);
  errors.push(...error);

  try {
    let i = 0;

    while (i < ITERATION_LIMIT) {
      const findToken = token(
        stack[stack.length - 1],
        errors[errors.length - 1]
      );
      stack.push(findToken);

      const [newSuccess, newError] = GIFTParser(findToken);

      if (newError !== null) {
        errors.push(...newError);
        i++;
      } else {
        break;
      }
    }
  } catch (err) {}

  return {
    ...message,
    result: [null, errors],
  };
}

function token(text: string, message: GIFTSyntaxError) {
  return escapeToken(
    text,
    findToken(text, message.found, message.location.start.offset)
  );
}

/**
 * Iterates through text to find a matching token,
 * looking at the token location first before looking
 * at the previous and next character simultaneously.
 */
function findToken(
  text: string,
  token: string | null,
  location: number
): number {
  if (token === null) {
    throw new Error("Token is Null.");
  }

  const SEARCH_LIMIT = 1;
  const UPPER_LIMIT = Math.min(text.length, location + SEARCH_LIMIT);
  const LOWER_LIMIT = Math.max(0, location - SEARCH_LIMIT);

  const iter = {
    i: 0,
  };
  let iteratorUpper = location + iter.i;
  let iteratorLower = location - iter.i;

  while (
    iteratorUpper < UPPER_LIMIT &&
    (iteratorLower > LOWER_LIMIT || iteratorLower === 0)
  ) {
    //  Favour tokens that are before the token location
    if (text[iteratorLower] === token) {
      return iteratorLower;
    }

    if (text[iteratorUpper] === token) {
      return iteratorUpper;
    }
    iter.i++;
  }

  throw new Error("No Token Found.");
}

/**
 * Adds an escape in front of a token. Used to
 * allow GIFT's PEG parser to parse text with errors,
 * by emulating error correction.
 * @param text
 * @param location
 */
function escapeToken(text: string, location: number): string {
  const ESCAPE = "\\";
  const NEWLINE = "\n";
  const tokens = [":", "~", "=", "#", "{", "}", "\n"];

  const tokenIsAccepted = tokens.includes(text[location]);

  if (tokenIsAccepted && text[location] === NEWLINE) {
    const escapeLocation = location + 1;
    const tokenNotEscaped = text[escapeLocation] !== ESCAPE;

    if (tokenNotEscaped) {
      return `${text.slice(0, location + 1)}${ESCAPE}${text.slice(
        location + 1
      )}`;
    } else {
      throw new Error("No Token Found.");
    }
  }

  const escapeLocation = location - 1 > 0 ? location - 1 : 0;
  const tokenNotEscaped = text[escapeLocation] !== ESCAPE;

  if (tokenIsAccepted && tokenNotEscaped) {
    return `${text.slice(0, location)}${ESCAPE}${text.slice(location)}`;
  }

  throw new Error("No Token Found.");
}

/**
 * Process error messages to display the correct line, column and offset
 * numbers for the text.
 * @param originalText The text being parsed. Must have LF line endings.
 * @param message The error message.
 * @param lineEnding The type of line-ending used (e.g. \n, \r\n, \r).
 * Used to correct offset property of syntax errors.
 */

export function correctMessage(
  message: GIFTParseSection,
  originalText: string,
  lineEnding: string
): GIFTParseSection {
  return correctError(originalText, correctToken(message), lineEnding);
}

function correctError(
  text: string,
  message: GIFTParseSection,
  lineEnding: string
): GIFTParseSection {
  const location = message.location;

  const NEWLINE = "\n";
  const charPerLine = text
    .split(NEWLINE)
    .map((line) => line.length + lineEnding.length);
  const offsetIndex = charPerLine[location.start - 2]
    ? charPerLine[location.start - 2]
    : 0;

  const [success, error] = message.result;

  if (success !== null || error === null) {
    return message;
  }

  const newError = error.map((item) =>
    addError(
      {
        offset: offsetIndex,
        line: location.start - 1,
        column: 0,
      },
      item
    )
  );

  return {
    ...message,
    result: [null, newError],
  };
}

function correctToken(message: GIFTParseSection): GIFTParseSection {
  const iter = {
    prevLine: -1,
    count: 0,
  };

  const [success, error] = message.result;

  if (success !== null || error === null) {
    return message;
  }

  const newError = error.map((item, idx) => {
    const { start, end } = item.location;

    iter.prevLine === start.line
      ? iter.count++
      : ((iter.count = 0), (iter.prevLine = start?.line));

    return end.line > start.line
      ? removeOffset(idx, removeColumnStart(iter.count, item))
      : removeOffset(idx, removeColumn(iter.count, item));
  });

  return {
    ...message,
    result: [null, newError],
  };
}

function addError(
  number: {
    line: number;
    offset: number;
    column: number;
  },
  message: GIFTSyntaxError
): GIFTSyntaxError {
  return {
    ...message,
    location: {
      ...message.location,
      start: {
        ...message.location.start,
        line: message.location.start.line + number.line,
        offset: message.location.start.offset + number.offset,
        column: message.location.start.column + number.column,
      },
      end: {
        ...message.location.end,
        line: message.location.end.line + number.line,
        offset: message.location.end.offset + number.offset,
        column: message.location.end.column + number.column,
      },
    },
  };
}

function removeOffset(
  number: number,
  message: GIFTSyntaxError
): GIFTSyntaxError {
  return {
    ...message,
    location: {
      ...message.location,
      start: {
        ...message.location.start,
        offset: message.location.start.offset - number,
      },
      end: {
        ...message.location.end,
        offset: message.location.end.offset - number,
      },
    },
  };
}

function removeColumn(
  number: number,
  message: GIFTSyntaxError
): GIFTSyntaxError {
  return {
    ...message,
    location: {
      ...message.location,
      start: {
        ...message.location.start,
        column: message.location.start.column - number,
      },
      end: {
        ...message.location.end,
        column: message.location.end.column - number,
      },
    },
  };
}

function removeColumnStart(
  number: number,
  message: GIFTSyntaxError
): GIFTSyntaxError {
  return {
    ...message,
    location: {
      ...message.location,
      start: {
        ...message.location.start,
        column: message.location.start.column - number,
      },
    },
  };
}
