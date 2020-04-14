STATIC_RECORD_FOLDER=./static/records/ucastudio/*/*
STATIC_RECORD_FOLDER=./static/records/ucastudio/*/*
find $STATIC_RECORD_FOLDER -type d -mtime +7 -exec rm -Rf {} \;
