#!/bin/bash
# memory-monitor.sh
# Usage: POD=gwy-0 NAMESPACE=prod ./memory-monitor.sh
# 
# Básico (cada 30 min, límite 5 GiB)
# POD=gwy-0 NAMESPACE=prod ./memory-monitor.sh

# Límite de 8 GiB, cada 15 min
# POD=gwy-0 NAMESPACE=prod LIMIT_GIB=8.000 INTERVAL=900 ./memory-monitor.sh

# En background
# nohup POD=gwy-0 NAMESPACE=prod ./memory-monitor.sh > monitor.log 2>&1 &

POD="${POD:?Set POD variable: export POD=gwy-0}"
NAMESPACE="${NAMESPACE:-default}"
INTERVAL="${INTERVAL:-1800}"
LIMIT_GIB="${LIMIT_GIB:-5.000}"
LIMIT_BYTES=$(awk "BEGIN{printf \"%.0f\", $LIMIT_GIB * 1073741824}")

echo "Monitoring $POD (ns: $NAMESPACE) every $(( INTERVAL / 60 )) min — Ctrl+C to stop"

while true; do
    TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
    FILE="${POD}_${TIMESTAMP}.txt"

    echo "[$TIMESTAMP] Collecting..."

    {
        echo "=== TIMESTAMP ==="
        echo "$TIMESTAMP"
        echo ""

        echo "=== USAGE ==="
        kubectl exec -n "$NAMESPACE" "$POD" -- cat /sys/fs/cgroup/memory.current | \
            awk "{printf \"current: %.3f GiB / ${LIMIT_GIB} GiB (%.1f%%)\n\", \$1/1073741824, \$1/${LIMIT_BYTES}*100}"
        echo ""

        echo "=== SWAP ==="
        kubectl exec -n "$NAMESPACE" "$POD" -- cat /sys/fs/cgroup/memory.swap.current 2>/dev/null | \
            awk '{printf "swap used: %.3f GiB\n", $1/1073741824}'
        kubectl exec -n "$NAMESPACE" "$POD" -- cat /sys/fs/cgroup/memory.swap.max 2>/dev/null | \
            awk '{if($1=="max") print "swap max: max (unlimited)"; else printf "swap max: %.3f GiB\n", $1/1073741824}'
        echo ""

        echo "=== MEMORY.HIGH ==="
        kubectl exec -n "$NAMESPACE" "$POD" -- cat /sys/fs/cgroup/memory.high | \
            awk '{if($1=="max") print "max (no soft limit)"; else printf "%.3f GiB (%d bytes)\n", $1/1073741824, $1}'
        echo ""

        echo "=== BREAKDOWN ==="
        kubectl exec -n "$NAMESPACE" "$POD" -- cat /sys/fs/cgroup/memory.stat | \
            grep -E "^anon |^file |^shmem |^inactive_anon |^active_anon |^inactive_file |^active_file |^slab_reclaimable |^swapcached |^zswap |^zswapped " | \
            awk '{printf "  %-20s %10.2f MiB\n", $1, $2/1048576}'
        echo ""

        echo "=== EVENTS ==="
        kubectl exec -n "$NAMESPACE" "$POD" -- cat /sys/fs/cgroup/memory.events
        echo ""

        echo "=== SWAP EVENTS ==="
        kubectl exec -n "$NAMESPACE" "$POD" -- cat /sys/fs/cgroup/memory.swap.events 2>/dev/null || echo "  no swap events file"

    } > "$FILE" 2>&1

    # Show in terminal too
    cat "$FILE"
    echo ""
    echo "--- Saved: $FILE ---"
    echo ""

    sleep "$INTERVAL"
done