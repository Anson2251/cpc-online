export const starterProgram = `
DECLARE message : STRING
message <- "Hello from vibe-cpc
OUTPUT message
`.trim();

export const debuggerDemoProgram = `
// To start, click the 'Debug' button in the top right-hand corner.
// To add a breakpoint, click on the right-hand side of a line number.

FUNCTION BinarySearch(values : ARRAY[1:10] OF INTEGER, left : INTEGER, right : INTEGER, target : INTEGER) RETURNS INTEGER
  DECLARE mid : INTEGER

  // Useful pause point: inspect left/right/target
  DEBUGGER

  IF left > right THEN
    RETURN -1
  ENDIF

  mid <- (left + right) DIV 2

  // Useful pause point: inspect mid and values[mid]
  DEBUGGER

  IF values[mid] = target THEN
    RETURN mid
  ENDIF

  IF target < values[mid] THEN
    RETURN BinarySearch(values, left, mid - 1, target)
  ELSE
    RETURN BinarySearch(values, mid + 1, right, target)
  ENDIF
ENDFUNCTION

DECLARE data : ARRAY[1:10] OF INTEGER
DECLARE target : INTEGER
DECLARE resultIndex : INTEGER
DECLARE i : INTEGER

FOR i <- 1 TO 10
  data[i] <- i * 5
NEXT i

OUTPUT "Sorted values (step 5):"
FOR i <- 1 TO 10
  OUTPUT data[i]
NEXT i

OUTPUT "Enter target value:"
INPUT target

resultIndex <- BinarySearch(data, 1, 10, target)

IF resultIndex = -1 THEN
  OUTPUT "Target not found"
ELSE
  OUTPUT "Target found at index:"
  OUTPUT resultIndex
ENDIF
`.trim();