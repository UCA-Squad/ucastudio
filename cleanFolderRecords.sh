STATIC_RECORD_FOLDER=./static/records/ucastudio/*/*
seven_days=$(date -d '7 days ago' +%s)
for f in $STATIC_RECORD_FOLDER; do
   [ -d "$f" ] || continue 
   timestampCurrentFolder=$(stat -c '%Y' $f)
   (( timestampCurrentFolder <  seven_days)) && rm -rf "$f"
done