# Fix Call Log Page Loading Issues

## Problem Analysis
The "Call Log Page not loading" issue is likely caused by two main factors:
1.  **Performance Bottleneck in Stats**: The `getCallStats` function in `server/storage.ts` fetches **all** calls for a tenant into memory to calculate statistics. As the number of calls grows, this query becomes slower and consumes excessive memory, potentially causing timeouts or server crashes. The frontend blocks rendering until stats are loaded (or fails if the request times out).
2.  **Pagination Logic Flaw**: The `getAllCalls` endpoint does not return the current `page` number, causing the frontend's `useInfiniteQuery` to potentially calculate the next page incorrectly (defaulting to page 1 logic), which breaks infinite scrolling.

## Proposed Solution

### 1. Optimize Backend Statistics (Critical)
Rewrite `getCallStats` in `server/storage.ts` to use SQL aggregations instead of in-memory processing.
- Use `count()`, `sum()`, `avg()` and conditional counts (using `sql` template tag) to calculate all metrics in the database.
- This will drastically reduce data transfer and memory usage.

### 2. Improve Pagination Metadata
Update `getAllCalls` in `server/storage.ts` to return pagination metadata:
- `page`: Current page number
- `limit`: Items per page
- `totalPages`: Total number of pages (optional but helpful)

### 3. Fix Frontend Pagination Logic
Update `client/src/pages/CallLogPage.tsx`:
- Modify `getNextPageParam` to use the `page` and `limit` returned from the backend.
- Ensure robust handling of the infinite scroll.

### 4. Improve Frontend Loading State
- Review the loading condition `if (callsLoading || (statsLoading && !stats))` to ensure the page doesn't hang indefinitely if stats fail (though the backend fix should prevent failure).

## Implementation Steps

1.  **Modify `server/storage.ts`**:
    *   Update `getCallStats` to use Drizzle ORM aggregations.
    *   Update `getAllCalls` to include `page` and `limit` in the return object.

2.  **Modify `client/src/pages/CallLogPage.tsx`**:
    *   Update `useInfiniteQuery`'s `getNextPageParam` to use the new metadata.

3.  **Verification**:
    *   Verify the page loads quickly even with many calls.
    *   Verify infinite scroll works correctly.
